import { parseISO } from "date-fns"
import { Base64 } from "js-base64"
import { debounce } from "lodash-es"
import { difference } from "lodash-es"
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

import type { CollectionStore, StoredItem } from "./collectionStore"
import type { FileSource, UploadQueue } from "./uploadQueue"
import { Heartbeat } from "./heartbeat"
import {
    ObservableLoroDoc,
    loroToBase64,
    loroFromBase64,
    mergeChanges,
    hasChanges,
} from "./loroUtils"
import type {
    FileProps,
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
import { AutoReconnect } from "./utils/autoReconnect"

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
    if (!match) return null
    const channel = parseInt(match[1], 10)
    const rest = match[2]
    try {
        const parsed = JSON.parse(rest)
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
        const { store, errorHandler, logger, url, authToken, webSocketImpl } =
            props

        this.logger = logger === undefined ? defaultLogger() : logger
        this.store = store
        this.errorHandler = errorHandler

        makeObservable(this, {
            status: observable,
        })

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
                    `Unhandled exception in message handler, %s`,
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
        const channel = this.next_channel_index
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
        this.logger.info(
            `Opened channel "%s" for collection %s`,
            channel,
            props.col,
        )
        return collection
    }

    onConnect() {
        this.logger.info("Connection established")
        this.status = ConnectionStatus.Connected

        this.heartbeat = new Heartbeat({
            logger: this.logger,
            heartbeat: (i: number) => {
                this.logger.trace(`Sending heartbeat: %s`, i)
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
        this.logger.trace("Received message: %s", msg)
        const parsed = parseMessage<ServerMessage>(msg)
        if (parsed === null) {
            this.logger.error("Couldn't parse message: %s", msg)
            return
        }
        const { channel, message } = parsed

        if (channel === 0) {
            this.handleSystemMessage(message)
        } else {
            const col = this.collections[channel]
            if (col) {
                col.handleMessage(message)
            } else {
                this.logger.warn(
                    "Received message in closed channel: %s",
                    channel,
                )
                if ("col" in message) {
                    this.send(channel, { kind: "sync_stop", col: message.col })
                }
            }
        }
    }

    handleSystemMessage(msg: ServerMessage) {
        if (msg.kind === "h") {
            this.logger.trace("Recieved hearbeat response")
            this.heartbeat?.handleHeartbeatResponse(msg.i)
        } else if (msg.kind === "connection_error") {
            this.logger.warn(
                "Connection error, code: %s, disconnecting",
                msg.code,
            )
            this.disconnect?.()
            this.errorHandler?.(msg)
        }
    }

    send(channel: number, msg: ClientMessage) {
        this.transport.send(String(channel) + ":" + JSON.stringify(msg))
    }

    closeChannel(channel: number) {
        this.logger.info(`Closing channel: %s`, channel)
        delete this.collections[channel]
    }
}

type FileInitialValues = {
    props: FileProps
    source: FileSource | null
    isCreated: boolean
}

class ItemFile {
    props: FileProps
    source: FileSource | null
    isCreated: boolean

    constructor(initial: FileInitialValues) {
        const { props, source, isCreated } = initial
        this.props = props
        this.source = source
        this.isCreated = isCreated
    }
}

const isItemChanged = (local: ItemData | null, remote: ItemData | null) => {
    return (
        local === null ||
        remote === null ||
        // Content is changed
        hasChanges(local.content, remote.content) ||
        // Files are changed
        difference([...local.files.keys()], [...remote.files.keys()]).length > 0
    )
}

export enum ItemState {
    Changed = 1,
    UploadingFiles = 2,
    ChangesSent = 3,
    Synchronized = 4,
    Error = 5,
}

type ItemData = {
    content: ObservableLoroDoc
    files: Map<string, ItemFile>
}

interface ItemInitialValues {
    id: string
    remote: ItemData | null
    local: ItemData | null
    state: ItemState
    localUpdatedAt?: Date
    createdAt?: Date
    updatedAt?: Date
}

class Item<T> {
    id: string

    // Local version of the document. After deleting it remains in the
    // collection with `null` value until server acknowledges deletion.
    local: ItemData | null

    // Remote version of the document. It is `null` until server acknowledges
    // creation.
    remote: ItemData | null

    state: ItemState

    // Used to sort items in when they are not in synchronized state
    localUpdatedAt?: Date = undefined
    createdAt?: Date = undefined
    updatedAt?: Date = undefined

    extractData?: ExtractData<T> | undefined

    get data() {
        if (this.local === null) {
            return undefined
        } else {
            return this.extractData?.(this.local.content.doc)
        }
    }

    constructor(
        initialValues: ItemInitialValues,
        extractData: ExtractData<T> | undefined = undefined,
    ) {
        Object.assign(this, initialValues)
        this.extractData = extractData
        makeObservable(this, {
            remote: observableShallow,
            local: observableShallow,
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

    uploadQueue: UploadQueue
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
        this.loadFromStore()
    }

    createItem(initialValues: ItemInitialValues) {
        return new Item(initialValues, this.extractData)
    }

    async loadFromStore() {
        if (!this.store) return

        const { colrev, items } = await this.store.load()
        this.colrev = colrev
        items.forEach((stored: StoredItem) => {
            const { id, local, remote } = stored

            let localData: ItemData | null
            if (local === null) {
                localData = null
            } else {
                const localFiles = new Map()
                local?.files.forEach((f) => {
                    localFiles.set(
                        f.props.id,
                        new ItemFile({
                            props: f.props,
                            isCreated: f.isCreated,
                            source: null, // TODO restore source
                        }),
                    )
                })
                localData = { content: local.content, files: localFiles }
            }

            let remoteData: ItemData | null
            if (remote === null) {
                remoteData = null
            } else {
                const remoteFiles = new Map()
                remote?.files.forEach((f) => {
                    // Need to ensure that file with same ID in local and remote
                    // will be the same ItemFile instance, to correctly update
                    // status and work with sources
                    const localFile = localData?.files.get(f.props.id)
                    if (localFile) {
                        remoteFiles.set(f.props.id, localFile)
                    } else {
                        remoteFiles.set(
                            f.props.id,
                            new ItemFile({
                                props: f.props,
                                isCreated: f.isCreated,
                                source: null, // TODO restore source
                            }),
                        )
                    }
                })
                remoteData = { content: remote.content, files: remoteFiles }
            }

            const isChanged = isItemChanged(localData, remoteData)
            const item = this.createItem({
                id,
                local: localData,
                remote: remoteData,
                state: isChanged ? ItemState.Changed : ItemState.Synchronized,
                localUpdatedAt: stored.localUpdatedAt,
                createdAt: stored.createdAt,
                updatedAt: stored.updatedAt,
            })
            this.items.set(id, item)

            if (isChanged) this.flushQueue.add(id)
        })
        this.logger.debug(
            `Loaded from local store %s items, colrev: %s`,
            items.length,
            colrev,
        )
        this.isLoadedFromStore = true
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
        this.logger.warn("Sync error: %s", msg)
        this.status = CollectionStatus.SyncError
        this.client.closeChannel(this.channel)
    }

    #updateItemFiles<T>(item: Item<T>, files: FileProps[]) {
        const remote = item.remote!

        // Create remote added files
        const remoteAddedFiles = files.filter((f) => !remote.files.has(f.id))
        remoteAddedFiles.forEach((props) => {
            const localFile = item.local?.files.get(props.id)
            if (localFile) {
                // Acknowledged creation of the local file
                localFile.isCreated = true
                remote.files.set(localFile.props.id, localFile)
            } else {
                // Received new file
                const file = new ItemFile({
                    props,
                    isCreated: true,
                    source: null,
                })
                remote.files.set(props.id, file)
                item.local?.files.set(props.id, file)
            }
        })

        // Delete remote deleted files
        const remoteDeletedFiles = difference(
            Object.keys(remote.files),
            files.map((f) => f.id),
        )
        remoteDeletedFiles.map((id) => {
            item.local?.files.delete(id)
            remote.files.delete(id)
            // TODO also remove files from queue to cancel uploading
        })
    }

    handleDocMessage(msg: DocMessage) {
        const { colrev, id, content, files, createdAt, updatedAt } = msg
        this.colrev = colrev

        if (content === null) {
            this.items.delete(id)
            this.enqueueBackup(id)
            return
        }

        const doc = loroFromBase64(content)
        const item = this.items.get(id)
        if (item === undefined || item.state === ItemState.Error) {
            // Receive new document and create new item
            const filesMap = new Map(
                files.map((props) => [
                    props.id,
                    new ItemFile({ props, source: null, isCreated: true }),
                ]),
            )
            const item = this.createItem({
                id,
                remote: { content: doc, files: filesMap },
                local: { content: doc.fork(), files: new Map(filesMap) },
                state: ItemState.Synchronized,
                updatedAt: parseISO(updatedAt),
                createdAt: parseISO(createdAt),
            })
            this.items.set(id, item)
            this.logger.debug("Received new doc: %s", id)
        } else {
            // Receive an update for the existing document or
            // acknowledge remote creation of the local document

            if (item.remote === null) {
                // Acknowledge remote creation of the document
                item.remote = { content: doc, files: new Map() }
            } else {
                // Update existing document
                item.remote.content = doc
            }
            // Already ensured that item.remote is not null
            const remote = item.remote!

            // Merge changes to the local document
            if (item.local !== null) {
                mergeChanges(item.local.content, remote.content)
            }

            this.#updateItemFiles(item, msg.files)

            item.updatedAt = parseISO(updatedAt)
            item.createdAt = parseISO(createdAt)

            // Update changed state
            const isChanged = isItemChanged(item.local, item.remote)
            item.state = isChanged ? ItemState.Changed : ItemState.Synchronized
            if (isChanged) {
                this.logger.debug("Merged remote doc into local: %s", id)
                this.flushQueue.add(id)
            } else {
                this.logger.debug(
                    "Received remote doc identical to local: %s",
                    id,
                )
                this.flushQueue.delete(id)
            }
        }
        this.enqueueBackup(id)
    }

    handleUpdateMessage(msg: ServerUpdateMessage) {
        const { colrev, id, contentUpdate, files, updatedAt } = msg
        this.colrev = colrev

        const item = this.items.get(id)

        if (!item) {
            this.logger.warn("Can't apply changes, unknown doc: %s", id)
            this.send({ kind: "get", col: this.col, id })
            return
        }

        if (item.remote === null) {
            this.logger.warn("Can't apply changes, doc is not created: %s", id)
            this.send({ kind: "get", col: this.col, id })
            return
        }

        // Apply content update
        if (contentUpdate !== null) {
            try {
                const parsedUpdate = Base64.toUint8Array(contentUpdate)
                item.remote.content.import(parsedUpdate)
                if (item.local !== null) {
                    item.local.content.import(parsedUpdate)
                }
            } catch {
                this.logger.warn("Can't import changes, loro error: %s", id)
                this.send({ kind: "get", col: this.col, id })
                return
            }
        }

        this.#updateItemFiles(item, files)

        item.updatedAt = parseISO(updatedAt)

        // Update changed state
        const isChanged = isItemChanged(item.local, item.remote)
        item.state = isChanged ? ItemState.Changed : ItemState.Synchronized
        if (isChanged) {
            this.flushQueue.add(id)
        } else {
            this.flushQueue.delete(id)
        }

        this.enqueueBackup(id)
    }

    handleDeleteMessage(msg: ServerDeleteMessage) {
        const { colrev, id } = msg
        this.colrev = colrev
        this.items.delete(id)
        this.enqueueBackup(id)
    }

    restoreItemRemoteState(item: Item<T>) {
        if (item.remote === null) {
            // If client tried to create document - it should be removed
            this.items.delete(item.id)
        } else {
            // If client tried to modify or delete document - should restore
            // last known remote state
            item.local = {
                content: new ObservableLoroDoc(item.remote.content.doc.fork()),
                files: new Map(item.remote.files),
            }
            item.state = ItemState.Synchronized
        }
    }

    handleChangeErrorMessage(msg: ChangeErrorMessage) {
        let { id, code } = msg

        const item = this.items.get(id)
        if (item === undefined) return

        this.logger.warn(
            'Rejected change for item "%s" with code "%s"',
            id,
            code,
        )

        // Client is referencing document that does not exist on server
        // To not lose data client should re-create document
        if (code === "not_found") {
            this.logger.warn("Document not found: %s", id)
            item.remote = null
            this.flushQueue.add(id)
            return
        }

        if (code === "forbidden") {
            this.logger.warn(`Forbidden: %s`, id)
            this.restoreItemRemoteState(item)
            return
        }

        if (code === "content_too_large") {
            this.logger.warn(`Content is too large: %s`, id)
            this.restoreItemRemoteState(item)
            return
        }

        if (code === "insufficient_storage") {
            // TODO set item state to "error"?
            return
        }

        // Files error
        if (
            msg.code === "file_not_found" ||
            msg.code === "file_missing_chunks"
        ) {
            // Should re-upload files
            const file = item.local?.files.get(msg.fileId)
            if (file) {
                file.isCreated = false
                // TODO re-add to upload-queue (FORCE - reset current state)
            }
            return
        }

        // Server couldn't apply changes - should reload document
        this.send({ kind: "get", id, col: this.col })
    }

    handleGetErrorMessage(msg: GetErrorMessage) {
        const { id, code } = msg
        this.logger.warn("Get error: %s", msg)
        if (code === "not_found") {
            this.logger.warn("Document doesn't exist: %s", id)
            this.items.delete(id)
        }
    }

    enqueueBackup(id: string) {
        this.backupQueue.add(id)
        this.backupDebounced()
    }

    async backup() {
        if (!this.store) return

        if (this.backupQueue.size === 0) return

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
            "Completed backup to local store, stored %s items",
            clonedQueue.size,
        )
    }

    flush() {
        this.logger.debug("Flushing changes, %s items", this.flushQueue.size)
        this.flushQueue.forEach((id) => {
            const item = this.items.get(id)
            if (item === undefined) return

            if (item.local !== null && item.remote === null) {
                const msg: ClientCreateMessage = {
                    kind: "create",
                    col: this.col,
                    id,
                    content: loroToBase64(item.local.content),
                    files: [], // TODO files
                }
                this.send(msg)
            } else if (item.local === null && item.remote !== null) {
                const msg: ClientDeleteMessage = {
                    kind: "delete",
                    col: this.col,
                    id,
                }
                this.send(msg)
            } else if (item.local !== null && item.remote !== null) {
                const localFileIds = [...item.local.files.keys()]
                const remoteFileIds = [...item.remote.files.keys()]
                // Files that are in the local list, but not in the remote
                const locallyCreatedFiles = difference(
                    localFileIds,
                    remoteFileIds,
                )

                let uploadNotCompleted = false
                locallyCreatedFiles.map((fileId) => {
                    const file = item.local!.files.get(fileId)!
                    const status = this.uploadQueue.getUploadStatus(fileId)
                    if (status === null) {
                        // Not enqueued for some reason
                        this.uploadQueue.add(file.props, () =>
                            this.flushQueue.add(item.id),
                        )
                        uploadNotCompleted = true
                        return
                    }

                    if (status.kind === "completed") {
                        // Completed successfully
                        return
                    }

                    if (status.kind === "error") {
                        // Couldn't complete upload
                        if (status.error.code === "file_too_big") {
                            // TODO delete file
                        }
                        if (
                            status.error.code === "insufficient_storage"
                        ) {
                            // TODO set itemstate to error & skip
                            uploadNotCompleted = true
                        }
                        return
                    }

                    // Upload in progress
                    uploadNotCompleted = true
                })

                // Skip flushing item if file uploading is not completed
                if (uploadNotCompleted) return

                // Files that are in the remote list, but not in the local
                const locallyDeletedFiles = difference(
                    remoteFileIds,
                    localFileIds,
                )
                const contentUpdate = item.local.content.export({
                    mode: "update",
                    from: item.remote.content.version(),
                })
                const msg: ClientUpdateMessage = {
                    kind: "update",
                    col: this.col,
                    id,
                    contentUpdate: Base64.fromUint8Array(contentUpdate),
                    filesUpdate: {
                        add: locallyCreatedFiles,
                        delete: locallyDeletedFiles,
                    },
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
                local: {
                    content: new ObservableLoroDoc(doc),
                    files: new Map(),
                },
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

        const doc = item.local.content
        const version = doc.version()
        doc.change(callback)
        if (doc.version().compare(version) === 0) {
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

    // files api
    // add/create file
    // delete file
    //
    // create / change document with adding/removing files - is it needed?
    // could use flush in microtask (immediate / 0 timeout)
    // to batch several immediate changes
}

export { SinkronClient, Item, ItemFile }
