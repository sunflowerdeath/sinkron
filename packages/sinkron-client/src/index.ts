import { Base64 } from "js-base64"
import { debounce } from "lodash-es"
import { LoroDoc } from "loro-crdt"
import {
    makeObservable,
    observable,
    observableRef,
    observableShallow,
    computed,
} from "mobx"
import pino, { Logger } from "pino"
import { v4 as uuidv4 } from "uuid"

import { AutoReconnect } from "./autoReconnect"
import type { CollectionStore, StoredItem } from "./collectionStore"
import { Heartbeat } from "./heartbeat"
import {
    ObservableLoroDoc,
    loroToBase64,
    mergeChanges,
    hasChanges,
} from "./loroUtils"
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
    HeartbeatMessage,
} from "./protocol"
import { Transport, WebSocketTransport } from "./transport"

export type ExtractData<T> = (doc: LoroDoc) => T

interface SinkronClientProps {
    url: string
    authToken: string
    store?: (col: string) => CollectionStore
    noAutoReconnect?: boolean
    errorHandler?: (msg: ServerMessage) => void
    logger?: Logger<string>
    webSocketImpl?: typeof WebSocket
}

interface SinkronCollectionProps<T> {
    col: string
    errorHandler?: (msg: ServerMessage) => void
    extractData?: ExtractData<T>
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

const parseMessage = <T>(
    msg: string,
): { message: T; channel: number } | null => {
    const match = msg.match(/^(\d{1,6}):(.*)$/)
    if (!match) {
        return null
    }
    const channel = parseInt(match[1], 10)
    const rest = match[2]
    try {
        let parsed = JSON.parse(rest)
        return { channel, message: parsed }
    } catch {
        return null
    }
}

class SinkronClient {
    logger: Logger<string>
    store?: (col: string) => CollectionStore
    errorHandler?: (msg: ServerMessage) => void

    next_channel_index = 1
    collections: { [key: string]: SinkronCollection<any> } = {}

    transport: Transport
    status: ConnectionStatus = ConnectionStatus.Disconnected
    heartbeat?: Heartbeat
    autoReconnect?: AutoReconnect
    disconnect?: () => void

    constructor(props: SinkronClientProps) {
        const { store, errorHandler, logger } = props

        this.logger = logger === undefined ? defaultLogger() : logger
        this.store = store
        this.errorHandler = errorHandler

        makeObservable(this, {
            status: observable,
        })

        this.init(props)
    }

    init(props: SinkronClientProps) {
        const { url, authToken, webSocketImpl } = props

        this.transport = new WebSocketTransport({
            url: `${url}?token=${authToken}`,
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
                    `Unhandled exception in message handler, ${e}`,
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
        const collection = new SinkronCollection({
            client: this,
            channel,
            store: this.store ? this.store(props.col) : undefined,
            logger: this.logger,
            ...props,
        })
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
                this.logger.trace(`Sending heartbeat: ${i}`)
                const heartbeat: HeartbeatMessage = { kind: "h", i }
                this.send(0, heartbeat)
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
        this.logger.trace(`Received message: ${msg}`)
        let parsed = parseMessage<ServerMessage>(msg)
        if (parsed === null) {
            this.logger.error(`Couldn't parse message: ${msg}`)
            return
        }
        let { channel, message } = parsed

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

export enum ItemState {
    Changed = 1,
    // TODO UploadingFiles,
    ChangesSent = 2,
    Synchronized = 3,
    Error = 4,
}

// TODO
// remote: { content, files } | null
// local: { content, files } | null
interface ItemInitialValues {
    id: string
    remote: ObservableLoroDoc | null
    local: ObservableLoroDoc | null
    state: ItemState
    localUpdatedAt?: Date
    createdAt?: Date
    updatedAt?: Date
}

class Item<T> {
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

export enum CollectionStatus {
    NotSynchronized = "not_synchronized",
    SyncInProgress = "sync_in_progress",
    SyncCompleted = "sync_completed",
    SyncError = "sync_error",
    SyncStopped = "sync_stopped",
}

type SinkronNewCollectionProps<T> = SinkronCollectionProps<T> & {
    client: SinkronClient
    channel: number
    store?: CollectionStore
    logger: Logger<string>
}

class SinkronCollection<T> {
    client: SinkronClient
    channel: number
    store?: CollectionStore
    col: string
    extractData?: ExtractData<T>

    logger: Logger<string>
    isLoadedFromStore: boolean = false
    initialSyncCompleted: boolean = false
    status: CollectionStatus = CollectionStatus.NotSynchronized
    colrev: number = 0
    items: Map<string, Item<T>> = new Map()

    backupQueue = new Set<string>()
    backupDebounced: ReturnType<typeof debounce>

    flushQueue = new Set<string>()
    flushDebounced: ReturnType<typeof debounce>

    constructor(props: SinkronNewCollectionProps<T>) {
        Object.assign(this, props)
        makeObservable(this, {
            items: observableShallow,
            colrev: observable,
            isLoadedFromStore: observable,
            status: observable,
            initialSyncCompleted: observable,
        })
        this.init()
    }

    async init() {
        if (this.store) await this.loadFromStore()
        this.isLoadedFromStore = true
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
                updatedAt: stored.updatedAt,
            })
            this.items.set(id, item)
            if (isChanged) this.flushQueue.add(id)
        })
        this.logger.debug(
            `Loaded from local store ${items.length} items, colrev: ${colrev}`,
        )
    }

    send(msg: ClientMessage) {
        this.client.send(this.channel, msg)
    }

    dispose() {
        this.send({ kind: "sync_stop", col: this.col })
        this.status = CollectionStatus.SyncStopped
        this.client.closeChannel(this.channel)
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

    enqueueBackup(id: string) {
        this.backupQueue.add(id)
        this.backupDebounced()
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
            `Completed backup to local store, stored ${clonedQueue.size} items`,
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

    onChangeItem(id: string, flushImmediate: boolean) {
        this.enqueueBackup(id)
        this.flushQueue.add(id)
        if (this.status === CollectionStatus.SyncCompleted) {
            if (flushImmediate) {
                this.flushDebounced.cancel()
                this.flush()
            } else {
                this.flushDebounced()
            }
        }
    }

    // Public API

    create(doc: LoroDoc) {
        const id = uuidv4()
        this.items.set(
            id,
            this.createItem({
                id,
                remote: null,
                local: new ObservableLoroDoc(doc),
                state: ItemState.Changed,
                localUpdatedAt: new Date(),
            }),
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

    // files ?
}

export { SinkronClient, Item }
