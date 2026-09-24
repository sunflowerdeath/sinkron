import { Base64 } from "js-base64"
import { LoroDoc } from "loro-crdt"
import { debounce } from "lodash-es"
import {
    makeObservable,
    observable,
    observableRef,
    action,
    computed,
    createAtom,
    IAtom,
} from "mobx"
import pino, { Logger } from "pino"

import { AutoReconnect } from "./autoReconnect"
import { Heartbeat } from "./heartbeat"
import type {
    ServerMessage,
    ClientMessage,
    SyncCompleteMessage,
    SyncErrorMessage,
    DocMessage,
    ServerUpdateMessage,
    ServerDeleteMessage,
    ChangeErrorMessage,
    GetErrorMessage,
    ClientCreateMessage,
    ClientUpdateMessage,
    ClientDeleteMessage,
} from "./protocol"
import { Transport, WebSocketTransport } from "./transport"

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
        const res = this.#doc.import(...args)
        this.#atom.reportChanged()
        return res
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

const loroToBase64 = (doc: ObservableLoroDoc) => {
    const snapshot = doc.export({ mode: "snapshot" })
    return Base64.fromUint8Array(snapshot)
}

export enum ItemState {
    Changed = 1,
    ChangesSent = 2,
    Synchronized = 3,
    Error = 4,
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
        extractData: ExtractData<T> | undefined = undefined,
    ) {
        Object.assign(this, initialValues)
        this.extractData = extractData
        makeObservable(this, {
            remote: observableRef,
            local: observableRef,
            state: observable,
            createdAt: observableRef,
            updatedAt: observableRef,
            localUpdatedAt: observableRef,
            data: computed,
        })
    }
}

export interface CollectionStore {
    save(id: string, item: Item<any>): Promise<void>
    delete(id: string): Promise<void>
    colrev(colrev: string): Promise<void>
    load(): Promise<{ items: StoredItem[]; colrev: string }>
    dispose(): void
}

interface SinkronClientProps {
    url: string
    authToken: string
    store?: CollectionStore
    noAutoReconnect?: boolean
    errorHandler?: (msg: ServerMessage) => void
    logger?: Logger<string>
    webSocketImpl?: typeof WebSocket
}

interface SinkronCollectionProps<T> {
    col: string
    errorHandler?: (msg: ServerMessage) => void
    dataExtractor?: ExtractData<T>
}

export enum ConnectionStatus {
    Disconnected = "disconnected",
    Connected = "connected",
    Ready = "ready",
    Error = "error",
}

const defaultLogger = (level = "debug"): Logger<string> => {
    const logger: Logger<string> = pino({
        transport: { target: "pino-pretty" },
    })
    logger.level = level
    return logger
}

class SinkronClient {
    logger: Logger<string>

    next_channel_index = 1
    collections: { [key: string]: SinkronCollection<any> } = {}

    transport: Transport
    status: ConnectionStatus = ConnectionStatus.Disconnected
    heartbeat?: Heartbeat
    autoReconnect?: AutoReconnect
    disconnect?: () => void

    constructor(props: SinkronClientProps) {
        const { store, errorHandler, logger } = props
        // this.store = store
        // this.errorHandler = errorHandler
        this.logger = logger === undefined ? defaultLogger() : logger
        makeObservable(this, {
            status: observable,
        })
        this.init(props)
    }

    init(props: SinkronClientProps) {
        const { url, authToken, webSocketImpl } = props

        this.transport = new WebSocketTransport({
            url,
            webSocketImpl,
            logger: this.logger,
        })

        this.transport.emitter.on("open", this.onConnect)
        this.transport.emitter.on("close", this.onDisconnect)
        this.transport.emitter.on("message", (msg: string) => {
            try {
                this.handleMessage(msg)
            } catch (e) {
                this.logger.error(
                    "Unhandled exception in message handler, %o",
                    e,
                )
            }
        })

        if (props.noAutoReconnect) {
            this.transport.open()
            this.disconnect = () => this.transport.close()
        } else {
            this.autoReconnect = new AutoReconnect({
                connect: () => this.transport.open(),
            })
            this.transport.emitter.on("open", () =>
                this.autoReconnect?.onOpen(),
            )
            this.transport.emitter.on("close", () =>
                this.autoReconnect?.onClose(),
            )
            this.disconnect = () => {
                this.autoReconnect?.stop()
                this.transport.close()
            }
        }
    }

    collection<T>(props: SinkronCollectionProps<T>): SinkronCollection<T> {
        let channel = this.next_channel_index
        this.next_channel_index += 1
        const collection = new SinkronCollection(this, channel, props)
        this.collections[channel] = collection
        if (this.status === ConnectionStatus.Connected) {
            collection.onConnect()
        }
        return collection
    }

    onConnect() {
        this.logger.info("Connection established")
        this.status = ConnectionStatus.Connected

        this.heartbeat = new Heartbeat({
            logger: this.logger,
            heartbeat: (i: number) => {
                this.logger.trace(`Sending heartbeat: ${i}`, i)
                const heartbeat = { kind: "h", i }
                this.transport.send(JSON.stringify(heartbeat))
            },
            heartbeatInterval: 30000,
            timeout: 5000,
            onTimeout: () => {
                this.logger.warn(
                    "No response from server for too long, disconnecting",
                )
                this.transport.close()
            },
        })

        for (const col of Object.values(this.collections)) {
            col.onConnect()
        }
    }

    onDisconnect() {
        this.logger.info("Connection closed")
        this.status = ConnectionStatus.Disconnected

        this.heartbeat?.dispose()
        this.heartbeat = undefined

        for (const col of Object.values(this.collections)) {
            col.onDisconnect()
        }
    }

    handleMessage(msg: string) {
        let { channel, message } = parseMessage(msg)

        if (channel === 0) {
            // handle heartbeat, connection error
        } else {
            let col = this.collections[channel]
            if (col) {
                col.handleMessage(message)
            } else {
                // Log message in unexpected channel
                // Send sync_stop
            }
        }
    }

    send(channel: number, msg: ClientMessage) {
        this.transport.send(String(channel) + ":" + JSON.stringify(msg))
    }

    closeChannel(channel: number) {
        delete this.collections[channel]
    }
}

export enum CollectionStatus {
    NotSynchronized = "not_synchronized",
    SyncInProgress = "sync_in_progress",
    SyncCompleted = "sync_completed",
    SyncError = "sync_error",
    Disposed = "disposed",
}

class SinkronCollection<T> {
    client: SinkronClient
    channel: number

    initialSyncCompleted: boolean = false
    status: CollectionStatus = CollectionStatus.NotSynchronized

    col: string
    colrev: number = 0
    items: Map<string, Item<T>> = new Map()

    backupQueue = new Set<string>()
    backupDebounced: ReturnType<typeof debounce>

    flushQueue = new Set<string>()
    flushDebounced: ReturnType<typeof debounce>

    constructor(
        client: SinkronClient,
        channel: number,
        props: SinkronCollectionProps<T>,
    ) {
        const { col } = props
        this.col = col
        this.client = client
        this.channel = channel
    }

    send(msg: ClientMessage) {
        this.client.send(this.channel, msg)
    }

    dispose() {
        this.send({ kind: "sync_stop", col: this.col })
        this.client.closeChannel(this.channel)
        this.status = CollectionStatus.Disposed
    }

    onConnect() {
        this.status = CollectionStatus.SyncInProgress
        this.send({
            kind: "sync_start",
            col: this.col,
            colrev: this.colrev,
        })
    }

    onDisconnect() {
        this.status = CollectionStatus.NotSynchronized
    }

    handleMessage(msg: ServerMessage) {
        if (msg.kind === "sync_complete") {
            this.handleSyncCompleteMessage(msg)
        } else if (msg.kind === "sync_error") {
            this.handleSyncErrorMessage(msg)
        } else if (msg.kind === "doc") {
            this.handleDocMessage(msg)
        } else if (msg.kind === "update") {
            this.handleUpdateMessage(msg)
        } else if (msg.kind === "delete") {
            this.handleDeleteMessage(msg)
        } else if (msg.kind === "change_error") {
            this.handleChangeErrorMessage(msg)
        } else if (msg.kind === "get_error") {
            this.handleGetErrorMessage(msg)
        } else {
            // TODO log unexpected message type
        }
    }

    handleSyncCompleteMessage(msg: SyncCompleteMessage) {
        this.colrev = msg.colrev
        this.flush()
        this.status = CollectionStatus.SyncCompleted
        this.initialSyncCompleted = true
        this.backup()
    }

    handleSyncErrorMessage(msg: SyncErrorMessage) {
        // TODO log sync error
        this.status = CollectionStatus.SyncError
        this.client.closeChannel(this.channel)
    }

    handleDocMessage(msg: DocMessage) {
        // TODO
    }

    handleUpdateMessage(msg: ServerUpdateMessage) {
        // TODO
    }

    handleDeleteMessage(msg: ServerDeleteMessage) {
        // TODO
    }

    handleChangeErrorMessage(msg: ChangeErrorMessage) {
        // TODO
    }

    handleGetErrorMessage(msg: GetErrorMessage) {
        // TODO
    }

    async backup() {
        if (this.store === undefined) return

        if (this.backupQueue.size === 0) {
            return
        }

        const colrev = this.colrev
        const clonedQueue = new Set<string>()
        for (const key of this.backupQueue) clonedQueue.add(key)
        this.backupQueue.clear()
        for (const key of clonedQueue) {
            const item = this.items.get(key)
            if (item) {
                await this.store.save(key, item)
            } else {
                await this.store.delete(key)
            }
        }
        await this.store.colrev(colrev)
        this.logger.debug(
            `Completed backup to local store, stored ${clonedQueue.size} items`
        )
    }

    flush() {
        this.logger.debug(`Flushing changes, ${this.flushQueue.size} items`)
        this.flushQueue.forEach((id) => {
            const item = this.items.get(id)
            if (item === undefined) return

            if (item.local !== null && item.remote === null) {
                let msg: ClientCreateMessage = {
                    kind: "create",
                    col: this.col,
                    id,
                    content: loroToBase64(item.local),
                    files: [], // TODO files
                }
                this.send(msg)
            } else if (item.local === null && item.remote !== null) {
                let msg: ClientDeleteMessage = {
                    kind: "delete",
                    col: this.col,
                    id,
                }
                this.send(msg)
            } else if (item.local !== null && item.remote !== null) {
                const update = item.local.export({
                    mode: "update",
                    from: item.remote.version(),
                })
                let msg: ClientUpdateMessage = {
                    kind: "update",
                    col: this.col,
                    id,
                    content_update: Base64.fromUint8Array(update),
                    files_update: null, // TODO files
                }
                this.send(msg)
            }
            item.state = ItemState.ChangesSent
        })
        this.flushQueue.clear()
    }
}

export { SinkronClient }
