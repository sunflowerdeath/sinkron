import { LoroDoc } from "loro-crdt"
import { createNanoEvents } from "nanoevents"
import { Base64 } from "js-base64"
import { v4 as uuidv4 } from "uuid"
import { nanoid } from "nanoid"
import pino, { Logger } from "pino"
import {
    makeObservable,
    makeAutoObservable,
    observable,
    action,
    computed,
    createAtom,
    IAtom
} from "mobx"
import debounce from "lodash-es/debounce"
import { parseISO } from "date-fns"

import { Op } from "./protocol"
import type {
    SyncErrorMessage,
    SyncCompleteMessage,
    DocMessage,
    ServerChangeMessage,
    ServerCreateMessage,
    ServerUpdateMessage,
    ChangeErrorMessage,
    HeartbeatMessage
} from "./protocol"

export interface Transport {
    open(): void
    close(): void
    send(msg: string): void
    emitter: ReturnType<typeof createNanoEvents>
}

export type WebSocketTransportProps = {
    url: string
    webSocketImpl?: typeof WebSocket
    logger: Logger<string>
}

class WebSocketTransport implements Transport {
    constructor(props: WebSocketTransportProps) {
        const { url, webSocketImpl, logger } = props
        this.url = url
        this.webSocketImpl = webSocketImpl || global.WebSocket
        this.logger = logger
    }

    emitter = createNanoEvents()
    url: string
    webSocketImpl: typeof WebSocket
    ws?: WebSocket
    logger: Logger<string>

    open() {
        this.logger.debug("Connecting to websocket: %s", this.url)
        this.ws = new this.webSocketImpl(this.url)
        this.ws.addEventListener("open", () => {
            this.emitter.emit("open")
        })
        this.ws.addEventListener("message", (event) => {
            this.emitter.emit("message", event.data)
        })
        this.ws.addEventListener("close", () => {
            this.emitter.emit("close")
            this.ws = undefined
        })
        this.ws.addEventListener("error", (err) => {
            this.logger.debug("Websocket connection error: %o", err)
            this.ws?.close()
        })
    }

    close() {
        this.ws?.close()
    }

    send(msg: string) {
        if (this.ws && this.ws.readyState === 1 /* open */) {
            this.ws.send(msg)
        } else {
            throw new Error("Couldn't send message: connection is closed")
        }
    }
}

const INITIAL_RECONNECT_TIMEOUT = 333
const MAX_RECONNECT_TIMEOUT = 10000

const autoReconnect = (t: Transport) => {
    let timeout = INITIAL_RECONNECT_TIMEOUT
    let isEnabled = true
    t.open()
    t.emitter.on("open", () => {
        // reset reconnect timeout
        timeout = INITIAL_RECONNECT_TIMEOUT
    })
    t.emitter.on("close", () => {
        if (!isEnabled) return
        console.log(`Connection closed. Auto-reconnect in ${timeout}ms`)
        setTimeout(() => {
            t.open()
        }, timeout)
        timeout = Math.min(MAX_RECONNECT_TIMEOUT, timeout * 2)
    })
    return () => {
        isEnabled = false
        t.close()
    }
}

const L = LoroDoc.prototype

class ObservableLoroDoc {
    #doc: LoroDoc
    #atom: IAtom

    constructor(doc: LoroDoc | undefined) {
        this.#doc = doc === undefined ? new LoroDoc() : doc
        this.#atom = createAtom("ObservableLoroDoc")
    }

    get doc() {
        this.#atom.reportObserved()
        return this.#doc
    }

    change(cb: (doc: LoroDoc) => void) {
        cb(this.#doc)
        this.#atom.reportChanged()
    }

    export(...args: Parameters<typeof L.export>): ReturnType<typeof L.export> {
        this.#atom.reportObserved()
        return this.#doc.export(...args)
    }

    fork(...args: Parameters<typeof L.fork>): ObservableLoroDoc {
        this.#atom.reportObserved()
        return new ObservableLoroDoc(this.#doc.fork(...args))
    }

    import(...args: Parameters<typeof L.import>): ReturnType<typeof L.import> {
        this.#atom.reportChanged()
        return this.#doc.import(...args)
    }

    toJSON(...args: Parameters<typeof L.toJSON>): ReturnType<typeof L.toJSON> {
        this.#atom.reportObserved()
        return this.#doc.toJSON(...args)
    }

    version(
        ...args: Parameters<typeof L.version>
    ): ReturnType<typeof L.version> {
        this.#atom.reportObserved()
        return this.#doc.version(...args)
    }
}


// Apply all missing changes from `fromDoc` to `toDoc`
const mergeChanges = (toDoc: ObservableLoroDoc, fromDoc: ObservableLoroDoc) => {
    const missingChanges = fromDoc.export({
        mode: "update",
        from: toDoc.version()
    })
    toDoc.import(missingChanges)
}

// Check if `docA` has any changes that are not present in `docB`
const hasChanges = (
    docA: ObservableLoroDoc,
    docB: ObservableLoroDoc
): boolean => {
    /* - -1: a < b
     * - 0: a == b
     * - 1: a > b
     * - undefined: a ∥ b: a and b are concurrent
     */
    const res = docA.version().compare(docB.version())
    return res === 1 || res === undefined
}

const loroToBase64 = (doc: ObservableLoroDoc) => {
    const snapshot = doc.export({ mode: "snapshot" })
    return Base64.fromUint8Array(snapshot)
}

const loroFromBase64 = (data: string) => {
    const doc = new LoroDoc()
    doc.import(Base64.toUint8Array(data))
    return new ObservableLoroDoc(doc)
}

type StoredItem = {
    id: string
    remote: ObservableLoroDoc | null
    local: ObservableLoroDoc | null
    createdAt?: Date
    updatedAt?: Date
    localUpdatedAt?: Date
}

export interface CollectionStore {
    save(id: string, item: Item<any>, colrev: string): Promise<void>
    delete(id: string, colrev: string): Promise<void>
    load(): Promise<{ items: StoredItem[]; colrev: string }>
    dispose(): void
}

class Deferred<T> {
    promise: Promise<T>
    resolve!: (res: T | PromiseLike<T>) => void
    constructor() {
        this.promise = new Promise((resolve) => {
            this.resolve = resolve
        })
    }
}

interface SerializedItem {
    id: string
    local: string | null
    remote: string | null
    createdAt?: Date
    updatedAt?: Date
    localUpdatedAt?: Date
}

class IndexedDbCollectionStore implements CollectionStore {
    constructor(key: string) {
        this.key = key
        const deferred = new Deferred<void>()
        const req = indexedDB.open(key)
        req.onsuccess = () => {
            this.db = req.result
            deferred.resolve()
        }
        req.onupgradeneeded = (event) => {
            // @ts-ignore
            const db = event.target.result
            db!.createObjectStore("items") // TODO wait until success?
            localStorage.setItem(`stored_collection/${key}`, "-1")
        }
        this.isReady = deferred.promise
    }

    key: string
    isReady: Promise<void>
    db?: IDBDatabase

    dispose() {
        this.db?.close()
    }

    async clear() {
        const store = this.db!.transaction("items", "readwrite").objectStore(
            "items"
        )
        const deferred = new Deferred<void>()
        const req = store.clear()
        req.onsuccess = () => deferred.resolve()
        await deferred.promise
        localStorage.setItem(`stored_collection/${this.key}`, "-1")
    }

    async save(id: string, item: Item<any>, colrev: string) {
        const { local, remote, localUpdatedAt, createdAt, updatedAt } = item
        const store = this.db!.transaction("items", "readwrite").objectStore(
            "items"
        )
        const serialized: SerializedItem = {
            id,
            local: local === null ? null : loroToBase64(local),
            remote: remote === null ? null : loroToBase64(remote),
            localUpdatedAt,
            createdAt,
            updatedAt
        }
        const deferred = new Deferred<void>()
        const req = store.put(serialized, id)
        req.onsuccess = () => deferred.resolve()
        await deferred.promise
        localStorage.setItem(`stored_collection/${this.key}`, colrev)
    }

    async delete(id: string, colrev: string) {
        const store = this.db!.transaction("items", "readwrite").objectStore(
            "items"
        )
        const deferred = new Deferred<void>()
        const req = store.delete(id)
        req.onsuccess = () => deferred.resolve()
        await deferred.promise
        localStorage.setItem(`stored_collection/${this.key}`, colrev)
    }

    deserializeItem(item: SerializedItem): StoredItem {
        const { id, local, remote, localUpdatedAt, createdAt, updatedAt } = item
        return {
            id,
            local: local === null ? null : loroFromBase64(local),
            remote: remote === null ? null : loroFromBase64(remote),
            localUpdatedAt,
            createdAt,
            updatedAt
        }
    }

    async load() {
        const val = localStorage.getItem(`stored_collection/${this.key}`)
        const colrev = val === null ? "-1" : val

        await this.isReady

        // retrieve items from indexed db
        const store = this.db!.transaction("items").objectStore("items")
        const req = store.getAll()
        const deferred = new Deferred<SerializedItem[]>()
        // @ts-ignore
        req.onsuccess = (event) => deferred.resolve(event.target.result)

        const result = await deferred.promise
        const items = result.map((item) => this.deserializeItem(item))
        return { colrev, items }
    }

    static async clearAll() {
        const toRemove = []
        const len = localStorage.length
        for (let i = 0; i < len; i++) {
            const key = localStorage.key(i)!
            const match = key.match(/^stored_collection\/(.+)/)
            if (match !== null) toRemove.push(match[1])
        }

        for (const id of toRemove) {
            const req = indexedDB.deleteDatabase(id)
            const deferred = new Deferred<void>()
            req.onsuccess = () => deferred.resolve()
            await deferred.promise
            localStorage.removeItem(`stored_collection/${id}`)
            console.log(`Deleted local storage for ${id}`)
        }
    }
}

export enum ItemState {
    Changed = 1,
    ChangesSent = 2,
    Synchronized = 3,
    Error = 4
}

interface ItemInitialValues {
    id: string
    remote: ObservableLoroDoc | null
    local: ObservableLoroDoc | null
    state: ItemState
    localUpdatedAt?: Date
    createdAt?: Date
    updatedAt?: Date
}

export type ExtractData<T> = (doc: LoroDoc) => T

export class Item<T> {
    id!: string
    // Remote version of the document. It is `null` until server acknowledges
    // creation.
    remote!: ObservableLoroDoc | null
    // Local version of the document. After deleting it remains in the
    // collection with `null` value until server acknowledges deletion.
    local!: ObservableLoroDoc | null
    state!: ItemState
    // Used to sort items in when they are not in synchronized state
    localUpdatedAt?: Date = undefined
    createdAt?: Date = undefined
    updatedAt?: Date = undefined
    sentChanges: Set<string> = new Set()

    extractData?: ExtractData<T> | undefined

    get data() {
        if (this.local === null) {
            return undefined
        } else {
            return this.extractData?.(this.local.doc)
        }
    }

    constructor(
        initialValues: ItemInitialValues,
        extractData: ExtractData<T> | undefined = undefined
    ) {
        Object.assign(this, initialValues)
        this.extractData = extractData
        makeObservable(this, {
            remote: observable.ref,
            local: observable.ref,
            state: observable,
            createdAt: observable.ref,
            updatedAt: observable.ref,
            localUpdatedAt: observable.ref,
            data: computed
        })
    }
}

const FLUSH_DELAY = 1000
const FLUSH_MAX_WAIT = 2000

// Interval between hearbeats. Should be less than disconnect timeout for being
// inactive on the server (=60s)
const HEARTBEAT_INTERVAL = 30000 // 30s
// Max wait time of the server's reply to heartbeat before closing connection.
const DISCONNECT_TIMEOUT = 5000

export enum ConnectionStatus {
    Disconnected = "disconnected",
    Connected = "connected",
    Ready = "ready",
    Error = "error"
}

interface SinkronCollectionProps<T> {
    url: string
    token: string
    col: string
    store?: CollectionStore
    noAutoReconnect?: boolean
    errorHandler?: (msg: SyncErrorMessage) => void
    logger?: Logger<string>
    webSocketImpl?: typeof WebSocket
    extractData?: ExtractData<T>
}

const defaultLogger = (level = "debug"): Logger<string> => {
    const logger: Logger<string> = pino({
        transport: { target: "pino-pretty" }
    })
    logger.level = level
    return logger
}

class SinkronCollection<T = undefined> {
    constructor(props: SinkronCollectionProps<T>) {
        const { col, store, errorHandler, logger, extractData } = props
        this.col = col
        this.store = store
        this.errorHandler = errorHandler
        this.logger = logger === undefined ? defaultLogger() : logger
        this.extractData = extractData
        makeAutoObservable(this, {
            items: observable.shallow,
            transport: false,
            store: false,
            logger: false,
            backupQueue: false,
            flushQueue: false,
            flushDebounced: false
        })
        this.flushDebounced = debounce(this.flush.bind(this), FLUSH_DELAY, {
            maxWait: FLUSH_MAX_WAIT
        })
        this.init(props)
    }

    col: string
    transport!: Transport
    store?: CollectionStore = undefined
    logger: Logger<string>
    errorHandler?: (msg: SyncErrorMessage) => void

    colrev: string = "0"
    extractData?: ExtractData<T>
    items: Map<string, Item<T>> = new Map()
    isLoaded = false
    status = ConnectionStatus.Disconnected
    initialSyncCompleted = false
    isDestroyed = false

    flushDebounced: ReturnType<typeof debounce>
    disconnect?: () => void
    backupQueue = new Set<string>()
    flushQueue = new Set<string>()

    // timeout for sending next heartbeat
    heartbeatTimeout?: ReturnType<typeof setTimeout>
    // timeout for disconnecting if not recieved hearbeat response
    disconnectTimeout?: ReturnType<typeof setTimeout>

    destroy() {
        this.isDestroyed = true
        this.disconnect?.()
        this.store?.dispose()
        clearTimeout(this.heartbeatTimeout)
        clearTimeout(this.disconnectTimeout)
    }

    async init(props: SinkronCollectionProps<T>) {
        const { url, token, webSocketImpl } = props

        if (this.store) await this.loadFromStore()
        this.isLoaded = true

        this.transport = new WebSocketTransport({
            url: `${url}?col=${this.col}&colrev=${this.colrev}&token=${token}`,
            webSocketImpl,
            logger: this.logger
        })
        this.transport.emitter.on(
            "open",
            action(() => {
                this.logger.debug("Connected to websocket")
                this.status = ConnectionStatus.Connected
                this.heartbeat(0)
            })
        )
        this.transport.emitter.on(
            "close",
            action(() => {
                this.logger.debug("Connection closed")
                this.status = ConnectionStatus.Disconnected
                this.flushDebounced.cancel()
                clearTimeout(this.heartbeatTimeout)
                clearTimeout(this.disconnectTimeout)
            })
        )
        this.transport.emitter.on("message", (msg: string) => {
            try {
                this.onMessage(msg)
            } catch (e) {
                this.logger.error(
                    "Unhandled exception in message handler, %o",
                    e
                )
            }
        })

        if (props.noAutoReconnect) {
            this.transport.open()
            this.disconnect = () => this.transport.close()
        } else {
            this.disconnect = autoReconnect(this.transport)
        }
    }

    createItem(initialValues: ItemInitialValues) {
        return new Item(initialValues, this.extractData)
    }

    async loadFromStore() {
        const { colrev, items } = await this.store!.load()
        this.colrev = colrev
        items.forEach((stored: StoredItem) => {
            const { id, local, remote } = stored
            const isChanged =
                local === null || remote === null || hasChanges(local, remote)
            const item = this.createItem({
                id,
                local,
                remote,
                state: isChanged ? ItemState.Changed : ItemState.Synchronized,
                localUpdatedAt: stored.localUpdatedAt,
                createdAt: stored.createdAt,
                updatedAt: stored.updatedAt
            })
            this.items.set(id, item)
            if (isChanged) this.flushQueue.add(id)
        })
        this.logger.debug(
            `Loaded from local store ${items.length} items, colrev: ${colrev}`
        )
    }

    heartbeat(i: number) {
        this.logger.trace(`Sending heartbeat: ${i}`, i)

        const heartbeat = { kind: "h", i }
        this.transport.send(JSON.stringify(heartbeat))

        this.disconnectTimeout = setTimeout(() => {
            this.logger.warn(
                "No response from server for too long, disconnecting"
            )
            this.transport.close()
        }, DISCONNECT_TIMEOUT)
    }

    onMessage(msg: string) {
        this.logger.trace("Received message: %o", msg)
        let parsed
        try {
            parsed = JSON.parse(msg)
        } catch {
            this.logger.error("Couldn't parse message JSON: %m", msg)
            return
        }
        if (parsed.kind === "h") {
            this.handleHeartbeatMessage(parsed)
        } else if (parsed.kind === "doc") {
            this.handleDocMessage(parsed)
        } else if (parsed.kind === "sync_complete") {
            this.handleSyncCompleteMessage(parsed)
        } else if (parsed.kind === "sync_error") {
            this.handleSyncError(parsed)
        } else if (parsed.kind === "change") {
            this.handleChangeMessage(parsed)
        } else if (parsed.kind === "change_error") {
            this.handleChangeErrorMessage(parsed)
        }
    }

    handleHeartbeatMessage(msg: HeartbeatMessage) {
        this.logger.trace("Recieved hearbeat response")

        // cancel disconnect by timeout
        clearTimeout(this.disconnectTimeout)

        // schedule next hearbeat
        this.heartbeatTimeout = setTimeout(
            () => this.heartbeat(msg.i + 1),
            HEARTBEAT_INTERVAL
        )
    }

    handleSyncCompleteMessage(msg: SyncCompleteMessage) {
        this.colrev = msg.colrev
        this.flush()
        this.status = ConnectionStatus.Ready
        this.initialSyncCompleted = true
        this.backup()
    }

    handleSyncError(msg: SyncErrorMessage) {
        this.logger.error("Sync error: %o", msg)
        this.status = ConnectionStatus.Error
        this.disconnect?.()
        this.errorHandler?.(msg)
    }

    handleChangeErrorMessage(msg: ChangeErrorMessage) {
        const { id, changeid, code } = msg

        const item = this.items.get(id)
        if (item === undefined) return

        if (changeid !== undefined && item.sentChanges.has(changeid)) {
            this.logger.warn("Rejected change: %s %s", id, code)
            item.sentChanges.delete(changeid)
        }

        if (code === "auth_failed") {
            this.logger.warn("Auth failed: %s", id)
            // TODO should reconnect
            return
        }

        // Client is referencing document that does not exist on server
        // To not lose data client should re-create document
        if (code === "not_found") {
            this.logger.warn("Document not found: %s", id)
            item.remote = null
            this.flushQueue.add(id)
            return
        }

        // Operation not permitted
        if (code === "forbidden") {
            this.logger.warn("Forbidden: %s", id)
            if (item.remote === null) {
                // If client tried to create document - it should be removed
                this.items.delete(id)
            } else {
                // If client tried to modify or delete document - should restore
                // last known remote state
                item.local = new ObservableLoroDoc(item.remote.doc.fork())
                item.state = ItemState.Synchronized
            }
            return
        }

        // Server couldn't apply change - should reload entire document
        this.transport.send(JSON.stringify({ kind: "get", id }))
    }

    handleChangeMessage(msg: ServerChangeMessage) {
        const { id, colrev, op, changeid } = msg

        if (this.items.has(id)) {
            const item = this.items.get(id)!
            if (item.sentChanges.has(changeid)) {
                this.logger.debug("Acknowledged own change: %s", changeid)
                item.sentChanges.delete(changeid)
            }
        }

        if (op === Op.Delete) {
            if (this.items.has(id)) {
                this.items.delete(id)
                this.flushQueue.delete(id)
                this.logger.debug("Deleted document: %s", id)
            }
        } else if (op === Op.Create) {
            this.handleDocMessage(msg)
        } else if (op === Op.Update) {
            this.handleUpdateMessage(msg)
        }

        this.colrev = colrev!
    }

    handleDocMessage(msg: DocMessage | ServerCreateMessage) {
        const { id, data, createdAt, updatedAt } = msg

        if (data === null) {
            this.items.delete(id)
            this.backupQueue.add(id)
            return
        }
        const doc = loroFromBase64(data)

        const item = this.items.get(id)
        if (item === undefined || item.state === ItemState.Error) {
            const item = this.createItem({
                id,
                remote: doc,
                local: doc.fork(),
                state: ItemState.Synchronized,
                updatedAt: parseISO(updatedAt),
                createdAt: parseISO(createdAt)
            })
            this.items.set(id, item)
            this.logger.debug("Received new doc: %s", id)
        } else {
            const item = this.items.get(id)!
            item.remote = doc
            if (item.local !== null) mergeChanges(item.local, item.remote)
            item.updatedAt = parseISO(updatedAt)
            item.createdAt = parseISO(createdAt)

            // update state
            const isChanged =
                item.local === null || hasChanges(item.local, item.remote)
            item.state = isChanged ? ItemState.Changed : ItemState.Synchronized
            item.sentChanges.clear()
            if (isChanged) {
                this.logger.debug("Merged remote doc into local: %s", id)
                this.flushQueue.add(id)
            } else {
                this.logger.debug(
                    "Received remote doc identical to local: %s",
                    id
                )
                this.flushQueue.delete(id)
            }
        }
        this.backupQueue.add(id)
    }

    handleUpdateMessage(msg: ServerUpdateMessage) {
        const { id, data } = msg

        const item = this.items.get(id)
        if (!item) {
            this.logger.warn("Can't apply changes, unknown doc: %s", id)
            this.transport.send(JSON.stringify({ kind: "get", id }))
            return
        }
        if (item.remote === null) {
            this.logger.warn("Can't apply changes, doc is not created: %s", id)
            this.transport.send(JSON.stringify({ kind: "get", id }))
            return
        }

        const update = Base64.toUint8Array(data)
        try {
            item.remote.import(update)
            if (item.local !== null) item.local.import(update)
        } catch {
            this.logger.warn("Can't import changes, loro error: %s", id)
            return
        }

        if (msg.updatedAt !== undefined) {
            item.updatedAt = parseISO(msg.updatedAt)
        }

        // update state
        const isChanged =
            item.local === null || hasChanges(item.local, item.remote)
        item.state = isChanged ? ItemState.Changed : ItemState.Synchronized
        item.sentChanges.clear()
        if (isChanged) {
            this.flushQueue.add(id)
        } else {
            this.flushQueue.delete(id)
        }

        this.backupQueue.add(id)
    }

    async backup() {
        if (this.store === undefined) return

        if (this.backupQueue.size === 0) {
            return
        }

        const clonedQueue = new Set<string>()
        for (const key of this.backupQueue) clonedQueue.add(key)
        this.backupQueue.clear()
        const colrev = this.colrev

        for (const key of clonedQueue) {
            const item = this.items.get(key)
            if (item) {
                await this.store.save(key, item, colrev)
            } else {
                await this.store.delete(key, colrev)
            }
        }
        this.logger.debug(
            `Completed backup to local store, stored ${clonedQueue.size} items`
        )
    }

    flush() {
        this.logger.debug(`Flushing changes, ${this.flushQueue.size} items`)
        this.flushQueue.forEach((id) => {
            const item = this.items.get(id)
            if (item === undefined) return

            const changeid = nanoid(8)

            const msg: any = {
                kind: "change",
                id,
                changeid,
                col: this.col
            }

            if (item.local !== null && item.remote === null) {
                msg.op = Op.Create
                msg.data = loroToBase64(item.local)
            } else if (item.local === null && item.remote !== null) {
                msg.op = Op.Delete
            } else if (item.local !== null && item.remote !== null) {
                msg.op = Op.Update
                const update = item.local.export({
                    mode: "update",
                    from: item.remote.version()
                })
                msg.data = Base64.fromUint8Array(update)
            }
            this.transport.send(JSON.stringify(msg))
            item.state = ItemState.ChangesSent
            item.sentChanges.clear()
            item.sentChanges.add(changeid)
        })
        this.flushQueue.clear()
    }

    onChangeItem(id: string, flushImmediate: boolean) {
        this.backupQueue.add(id)
        this.flushQueue.add(id)
        if (this.status === ConnectionStatus.Ready) {
            if (flushImmediate) {
                this.flushDebounced.cancel()
                this.flush()
            } else {
                this.flushDebounced()
            }
        }
    }

    create(doc: LoroDoc) {
        const id = uuidv4()
        this.items.set(
            id,
            this.createItem({
                id,
                remote: null,
                local: new ObservableLoroDoc(doc),
                state: ItemState.Changed,
                localUpdatedAt: new Date()
            })
        )
        this.onChangeItem(id, true)
        return id
    }

    change(id: string, callback: (d: LoroDoc) => void) {
        const item = this.items.get(id)
        if (item === undefined) {
            throw new Error("No item with id: " + id)
        }
        if (item.local === null) {
            throw new Error("Can't change deleted item: " + id)
        }

        const version = item.local.version()
        item.local.change(callback)
        if (item.local.version().compare(version) === 0) {
            // nothing changed
            return
        }
        item.localUpdatedAt = new Date()
        item.state = ItemState.Changed
        this.onChangeItem(id, false)
    }

    delete(id: string) {
        const item = this.items.get(id)
        if (!item) throw new Error(`No item with such id: "${id}"`)
        if (item.remote === null) {
            this.items.delete(id)
            return
        }
        item.local = null
        item.state = ItemState.Changed
        this.onChangeItem(id, true)
    }
}

export { SinkronCollection, IndexedDbCollectionStore }
