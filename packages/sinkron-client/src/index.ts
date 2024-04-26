import * as Automerge from "@automerge/automerge"
import type { ChangeFn } from "@automerge/automerge"
import { createNanoEvents } from "nanoevents"
import { Base64 } from "js-base64"
import { v4 as uuidv4 } from "uuid"
import { nanoid } from "nanoid"
import {
    makeObservable,
    makeAutoObservable,
    action,
    observable,
    ObservableMap
} from "mobx"
import { debounce } from "lodash-es"
import { parseISO } from "date-fns"

enum Op {
    Create = "+",
    Modify = "M",
    Delete = "-"
}

import type {
    SyncErrorMessage,
    SyncCompleteMessage,
    DocMessage,
    CreateMessage,
    ChangeMessage,
    ModifyMessage,
    ClientMessage,
    ServerMessage
} from "sinkron/types/protocol.d.ts"

type MessageHandler = (msg: string) => void

interface Transport {
    open(): void
    close(): void
    send(msg: string): void
    emitter: ReturnType<typeof createNanoEvents>
}

type WebSocketTransportProps = {
    url: string,
    webSocketImpl?: typeof WebSocket
}

class WebSocketTransport implements Transport {
    constructor(props: WebSocketTransportProps) {
        const { url, webSocketImpl } = props
        this.url = url
        // @ts-ignore
        this.webSocketImpl = webSocketImpl || global.WebSocket
    }

    emitter = createNanoEvents()
    url: string
    webSocketImpl: typeof WebSocket
    ws?: WebSocket

    open() {
        console.log("Connecting to websocket:", this.url)
        this.ws = new this.webSocketImpl(this.url)
        this.ws.addEventListener("open", (event) => {
            console.log("Connected to websocket!")
            this.emitter.emit("open")
        })
        this.ws.addEventListener("message", (event) => {
            this.emitter.emit("message", event.data)
        })
        this.ws.addEventListener("close", () => {
            this.emitter.emit("close")
            console.log("Websocket connection closed.")
            this.ws = undefined
        })
        this.ws.addEventListener("error", (err) => {
            console.log("Websocket connection error:", err)
            this.ws?.close()
        })
    }

    close() {
        this.ws?.close()
    }

    send(msg: string) {
        if (this.ws) {
            console.log("Sending message:", msg)
            this.ws.send(msg)
        } else {
            throw new Error("Couldn't send message: connection is closed")
        }
    }
}

const initialReconnectTimeout = 333
const maxReconnectTimeout = 10000

const autoReconnect = (t: Transport) => {
    let timeout = initialReconnectTimeout
    let isEnabled = true
    t.open()
    t.emitter.on("open", () => {
        // reset reconnect timeout
        timeout = initialReconnectTimeout
    })
    t.emitter.on("close", () => {
        if (!isEnabled) return
        console.log(`Connection closed. Auto-reconnect in ${timeout}ms`)
        setTimeout(() => {
            t.open()
        }, timeout)
        timeout = Math.min(maxReconnectTimeout, timeout * 2)
    })
    return () => {
        isEnabled = false
        t.close()
    }
}

const automergeToBase64 = <T>(doc: Automerge.Doc<T>) =>
    Base64.fromUint8Array(Automerge.save<T>(doc))

const automergeFromBase64 = <T>(data: string) =>
    Automerge.load<T>(Base64.toUint8Array(data))

const serializeItem = <T>(item: Item<T>) => {
    const serialized = {
        remote: item.remote ? automergeToBase64(item.remote) : null,
        local: item.local ? automergeToBase64(item.local) : null
    }
    return JSON.stringify(serialized)
}

const deserializeItem = <T>(data: string) => {
    const parsed = JSON.parse(data)
    return {
        remote: parsed.remote ? automergeFromBase64(parsed.remote) : null,
        local: parsed.local ? automergeFromBase64(parsed.local) : null
    }
}

type StoredItem<T> = {
    id: string
    remote: Automerge.Doc<T> | null
    local: Automerge.Doc<T> | null
    createdAt?: Date
    updatedAt?: Date
    localUpdatedAt?: Date
}

export interface CollectionStore<T> {
    save(id: string, item: Item<T>, colrev: number): Promise<void>
    delete(id: string, colrev: number): Promise<void>
    load(): Promise<{ items: StoredItem<T>[]; colrev: number }>
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

class IndexedDbCollectionStore<T> implements CollectionStore<T> {
    constructor(key: string) {
        this.key = key
        const deferred = new Deferred<void>()
        const req = indexedDB.open(key)
        req.onsuccess = (event) => {
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

    async save(id: string, item: Item<T>, colrev: number) {
        const { local, remote, localUpdatedAt, createdAt, updatedAt } = item
        const store = this.db!.transaction("items", "readwrite").objectStore(
            "items"
        )
        const serialized: SerializedItem = {
            id,
            local: local === null ? null : automergeToBase64(local),
            remote: remote === null ? null : automergeToBase64(remote),
            localUpdatedAt,
            createdAt,
            updatedAt
        }
        const deferred = new Deferred<void>()
        const req = store.put(serialized, id)
        req.onsuccess = () => deferred.resolve()
        await deferred.promise
        localStorage.setItem(`stored_collection/${this.key}`, String(colrev))
    }

    async delete(id: string, colrev: number) {
        const store = this.db!.transaction("items", "readwrite").objectStore(
            "items"
        )
        const deferred = new Deferred<void>()
        const req = store.delete(id)
        req.onsuccess = () => deferred.resolve()
        await deferred.promise
        localStorage.setItem(`stored_collection/${this.key}`, String(colrev))
    }

    deserializeItem(item: SerializedItem): StoredItem<T> {
        const { id, local, remote, localUpdatedAt, createdAt, updatedAt } = item
        return {
            id,
            local: local === null ? null : automergeFromBase64(local),
            remote: remote === null ? null : automergeFromBase64(remote),
            localUpdatedAt,
            createdAt,
            updatedAt
        }
    }

    async load() {
        const val = localStorage.getItem(`stored_collection/${this.key}`)
        const colrev = val === null ? -1 : Number(val)

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
            await deferred
            localStorage.removeItem(`stored_collection/${id}`)
            console.log(`Deleted local storage for ${id}`)
        }
    }
}

export enum ItemState {
    Changed = 1,
    ChangesSent = 2,
    Synchronized = 3
}

export interface Item<T> {
    id: string
    // Remote version of the document. It is `null` until server acknowledges
    // creation.
    remote: Automerge.Doc<T> | null
    // Local version of the document. After deleting it remains in the
    // collection with `null` value until server acknowledges deletion.
    local: Automerge.Doc<T> | null
    state: ItemState
    // Used to sort items in when they are not in synchronized state
    localUpdatedAt?: Date
    createdAt?: Date
    updatedAt?: Date
    sentChanges: Set<string>
}

interface ItemInitialValues<T> {
    id: string
    remote: Automerge.Doc<T> | null
    local: Automerge.Doc<T> | null
    state: ItemState
    localUpdatedAt?: Date
    createdAt?: Date
    updatedAt?: Date
}

const createItem = <T>(values: ItemInitialValues<T>): Item<T> =>
    makeObservable(
        {
            sentChanges: new Set(),
            localUpdatedAt: undefined,
            createdAt: undefined,
            updatedAt: undefined,
            ...values
        },
        {
            remote: observable.ref,
            local: observable.ref,
            state: observable,
            createdAt: observable.ref,
            updatedAt: observable.ref,
            localUpdatedAt: observable.ref
        }
    )

const flushDelay = 1000
const flushMaxWait = 2000

export enum ConnectionStatus {
    Disconnected = "disconnected",
    Connected = "connected",
    Sync = "sync",
    Ready = "ready",
    Error = "error"
}

interface CollectionProps<T> {
    col: string
    transport: Transport
    store?: CollectionStore<T>
    errorHandler?: (msg: SyncErrorMessage) => void
}

class Collection<T extends object> {
    constructor(props: CollectionProps<T>) {
        Object.assign(this, props)
        makeAutoObservable(this, {
            items: observable.shallow,
            store: false,
            transport: false,
            backupQueue: false,
            flushQueue: false,
            handleModifyMessage: action
        })
        this.flushDebounced = debounce(this.flush.bind(this), flushDelay, {
            maxWait: flushMaxWait
        })
        this.init()
    }

    errorHandler?: (msg: SyncErrorMessage) => void
    items: Map<string, Item<T>> = new Map()
    store!: CollectionStore<T>
    col!: string
    transport!: Transport
    colrev: number = -1

    flushDebounced: ReturnType<typeof debounce>
    stopAutoReconnect?: () => void
    backupQueue = new Set<string>()
    flushQueue = new Set<string>()

    isLoaded = false
    status = ConnectionStatus.Disconnected
    initialSyncCompleted = false

    isDestroyed = false

    destroy() {
        this.isDestroyed = true
        this.stopAutoReconnect?.()
        this.store?.dispose()
    }

    async init() {
        if (this.store) await this.loadFromStore()
        this.isLoaded = true
        this.transport.emitter.on("open", () => {
            this.status = ConnectionStatus.Connected
            this.startSync()
        })
        this.transport.emitter.on("close", () => {
            this.status = ConnectionStatus.Disconnected
            this.flushDebounced.cancel()
        })
        this.transport.emitter.on("message", this.onMessage.bind(this))

        if (!this.isDestroyed) {
            this.stopAutoReconnect = autoReconnect(this.transport)
        }
    }

    async loadFromStore() {
        console.log("Loading collection from store")
        const { colrev, items } = await this.store!.load()
        this.colrev = colrev
        items.forEach((stored: StoredItem<T>) => {
            const { id, local, remote } = stored
            const changes =
                local !== null && remote !== null
                    ? Automerge.getChanges(remote, local)
                    : []
            const isChanged =
                local === null || remote === null || changes.length > 0
            const item = createItem({
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
        console.log(
            `Loaded from local store ${items.length} items, colrev: ${colrev}`
        )
    }

    startSync() {
        const msg = {
            kind: "sync",
            col: this.col,
            colrev: this.colrev === -1 ? undefined : this.colrev
        }
        this.transport.send(JSON.stringify(msg))
        this.status = ConnectionStatus.Sync
    }

    onMessage(msg: string) {
        console.log("Received message:", msg)
        let parsed
        try {
            parsed = JSON.parse(msg)
        } catch (e) {
            console.log("Couldn't parse JSON:", e)
            return
        }
        if (parsed.kind === "doc") {
            this.handleDocMessage(parsed)
        } else if (parsed.kind === "sync_complete") {
            this.onSyncComplete(parsed)
        } else if (parsed.kind === "sync_error") {
            this.handleSyncError(parsed)
        } else if (parsed.kind === "change") {
            this.handleChangeMessage(parsed)
        }
        // TODO
        // error
    }

    onSyncComplete(msg: SyncCompleteMessage) {
        this.colrev = msg.colrev
        this.flush()
        this.status = ConnectionStatus.Ready
        this.initialSyncCompleted = true
        this.backup()
    }

    handleSyncError(msg: SyncErrorMessage) {
        console.log("Sync error:", msg)
        this.status = ConnectionStatus.Error
        this.stopAutoReconnect?.()
        this.errorHandler?.(msg)
    }

    handleChangeMessage(msg: ChangeMessage) {
        const { id, colrev, op, changeid } = msg

        if (this.items.has(id)) {
            const item = this.items.get(id)!
            if (item.sentChanges.has(changeid)) {
                console.log("Acknowledged own change:", changeid)
                item.sentChanges.delete(changeid)
            }
        }

        if (op === Op.Delete) {
            if (this.items.has(id)) {
                this.items.delete(id)
                console.log("Deleted document:", id)
            }
        } else if (op === Op.Create) {
            this.handleDocMessage(msg)
        } else if (op === Op.Modify) {
            this.handleModifyMessage(msg)
        }

        this.colrev = colrev!
    }

    handleDocMessage(msg: DocMessage | CreateMessage) {
        const { id, data, createdAt, updatedAt } = msg

        if (data === null) {
            this.items.delete(id)
            this.backupQueue.add(id)
            return
        }
        const doc = Automerge.load<T>(Base64.toUint8Array(data))

        if (!this.items.has(id)) {
            const item = createItem({
                id,
                remote: doc,
                local: Automerge.clone(doc),
                state: ItemState.Synchronized,
                updatedAt: updatedAt ? parseISO(updatedAt) : undefined,
                createdAt: createdAt ? parseISO(createdAt) : undefined
            })
            this.items.set(id, item)
            console.log("Received new doc:", id)
        } else {
            const item = this.items.get(id)!
            item.remote = doc
            if (item.local !== null) {
                item.local = Automerge.merge(item.local, Automerge.clone(doc))
            }

            if (updatedAt !== undefined) item.updatedAt = parseISO(updatedAt)
            if (createdAt !== undefined) item.createdAt = parseISO(createdAt)

            // update state
            const isChanged =
                item.local === null ||
                Automerge.getChanges(item.remote, item.local).length > 0
            item.state = isChanged ? ItemState.Changed : ItemState.Synchronized
            item.sentChanges.clear()
            if (isChanged) {
                console.log("Merged remote doc into local:", id)
                this.flushQueue.add(id)
            } else {
                console.log("Received remote doc identical to local:", id)
                this.flushQueue.delete(id)
            }
        }
        this.backupQueue.add(id)
    }

    handleModifyMessage(msg: ModifyMessage) {
        const { id, data, updatedAt } = msg

        const item = this.items.get(id)
        if (!item) {
            console.log("Can't apply changes, unknown doc:", id)
            // TODO request full document
            return
        }
        const changes = data.map(Base64.toUint8Array)
        if (item.remote === null) {
            console.log("Can't apply changes, doc is not created:", id)
            // TODO request full document
            return
        } else {
            ;[item.remote] = Automerge.applyChanges(item.remote, changes)
        }
        if (item.local !== null) {
            ;[item.local] = Automerge.applyChanges(item.local, changes)
        }
        if (msg.updatedAt !== undefined) {
            item.updatedAt = parseISO(msg.updatedAt)
        }

        // update state
        const isChanged =
            item.local === null ||
            Automerge.getChanges(item.remote, item.local).length > 0
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
        if (this.backupQueue.size === 0) {
            console.log("Backup is skipped, no items changed")
            return
        }

        const clonedQueue = new Set<string>()
        for (const key of this.backupQueue) clonedQueue.add(key)
        this.backupQueue.clear()
        const colrev = this.colrev

        for (const key of clonedQueue) {
            const item = this.items.get(key)
            if (item) {
                await this.store!.save(key, item, colrev)
            } else {
                await this.store!.delete(key, colrev)
            }
        }
        console.log(
            `Completed backup to local store, stored ${clonedQueue.size} items`
        )
    }

    flush() {
        console.log(`Flushing changes, ${this.flushQueue.size} items`)
        this.flushQueue.forEach((id) => {
            const item = this.items.get(id)!
            const changeid = nanoid(8)

            const msg: any = {
                kind: "change",
                id,
                changeid,
                col: this.col
            }

            let change
            if (item.remote === null) {
                msg.op = Op.Create
                msg.data = Base64.fromUint8Array(Automerge.save(item.local!))
            } else if (item.local === null) {
                msg.op = Op.Delete
            } else {
                msg.op = Op.Modify
                const changes = Automerge.getChanges(item.remote, item.local)
                msg.data = changes.map((c) => Base64.fromUint8Array(c))
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
            if (flushImmediate) this.flush()
            else this.flushDebounced()
        }
    }

    create(initialData: T) {
        let doc = Automerge.init<T>()
        doc = Automerge.change<T>(doc, (doc) => {
            Object.assign(doc, initialData)
        })
        const id = uuidv4()
        this.items.set(
            id,
            createItem({
                id,
                remote: null,
                local: doc,
                state: ItemState.Changed,
                localUpdatedAt: new Date()
            })
        )
        this.onChangeItem(id, true)
        return id
    }

    change(id: string, callback: ChangeFn<T>) {
        const item = this.items.get(id)
        if (!item || item.local == null) {
            throw new Error("No item with id: " + id)
        }
        if (item.local === null) {
            throw new Error("Can't change deleted item: " + id)
        }

        const prevChange = Automerge.getLastLocalChange(item.local)
        item.local = Automerge.change(item.local, callback)
        const change = Automerge.getLastLocalChange(item.local)
        if (change === undefined || change === prevChange) {
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
        item.local = null
        item.state = ItemState.Changed
        this.onChangeItem(id, true)
    }
}

export interface ChannelClientProps {
    url: string
    channel: string
    handler: (msg: string) => void
}

class ChannelClient {
    transport: Transport
    dispose: () => void
    constructor(props: ChannelClientProps) {
        const { url, channel, handler } = props
        this.transport = new WebSocketTransport({ url })
        this.transport.emitter.on("open", () => {
            this.transport.send(`subscribe:${channel}`)
        })
        this.transport.emitter.on("message", handler)
        this.dispose = autoReconnect(this.transport)
    }
}

export {
    Collection,
    WebSocketTransport,
    IndexedDbCollectionStore,
    ChannelClient
}
