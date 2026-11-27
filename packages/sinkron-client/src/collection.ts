import { parseISO } from "date-fns"
import { Base64 } from "js-base64"
import { debounce, difference } from "lodash-es"
import { LoroDoc } from "loro-crdt"
import {
    makeObservable,
    observable,
    observableRef,
    observableShallow,
    computed,
    action,
} from "mobx"
import { Logger } from "pino"
import { v4 as uuidv4 } from "uuid"

import type { CollectionStore, StoredItem } from "./collectionStore"
import type { FileSource } from "./fileSource"
import { SinkronClient } from "./index"
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
} from "./protocol"
import { type UploadStatus, UploadQueue } from "./uploadQueue"

const FLUSH_DELAY = 1000
const FLUSH_MAX_WAIT = 2000

const BACKUP_DELAY = 10000
const BACKUP_MAX_WAIT = 20000

export type ExtractData<T> = (doc: LoroDoc) => T

type FileInitialValues = {
    props: FileProps
    source: FileSource | null
    isCreated: boolean
    queue: UploadQueue
}

type ItemFileStatus = { kind: "pending" } | UploadStatus | { kind: "created" }

class ItemFile {
    props: FileProps
    source: FileSource | null
    isCreated: boolean
    queue: UploadQueue

    get status(): ItemFileStatus {
        return this.isCreated
            ? { kind: "created" }
            : this.queue.getStatus(this.props.id) || { kind: "pending" }
    }

    constructor(initial: FileInitialValues) {
        const { props, source, isCreated, queue } = initial
        this.props = props
        this.source = source
        this.isCreated = isCreated
        this.queue = queue

        makeObservable(this, {
            isCreated: observable,
            status: computed,
        })
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
    ChangesSent = 2,
    Synchronized = 3,
    Error = 4,
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

    setState(state: ItemState) {
        this.state = state
    }

    constructor(
        initialValues: ItemInitialValues,
        extractData: ExtractData<T> | undefined = undefined,
    ) {
        let { id, remote, local, state, localUpdatedAt, createdAt, updatedAt } =
            initialValues
        this.id = id
        this.remote = remote
        this.local = local
        this.state = state
        this.localUpdatedAt = localUpdatedAt
        this.createdAt = createdAt
        this.updatedAt = updatedAt

        this.extractData = extractData

        makeObservable(this, {
            remote: observableShallow,
            local: observableShallow,
            state: observable,
            setState: action,
            createdAt: observableRef,
            updatedAt: observableRef,
            localUpdatedAt: observableRef,
            data: computed,
        })
    }
}

type CreateFileProps = {
    contentType: string
    size: number
    source: FileSource
}

type CreateDocProps = {
    files?: CreateFileProps[]
}

export enum CollectionStatus {
    NotSynchronized = "not_synchronized",
    SyncInProgress = "sync_in_progress",
    SyncCompleted = "sync_completed",
    SyncError = "sync_error",
    SyncStopped = "sync_stopped",
}

type SinkronNewCollectionProps<T> = {
    col: string
    errorHandler?: (msg: ServerMessage) => void
    extractData?: ExtractData<T>
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
        this.client = props.client
        this.channel = props.channel
        this.col = props.col
        this.store = props.store
        this.logger = props.logger

        makeObservable(this, {
            items: observableShallow,
            colrev: observable,
            isLoadedFromStore: observable,
            status: observable,
            initialSyncCompleted: observable,
        })

        this.flushDebounced = debounce(this.#flush.bind(this), FLUSH_DELAY, {
            maxWait: FLUSH_MAX_WAIT,
        })
        this.backupDebounced = debounce(this.#backup.bind(this), BACKUP_DELAY, {
            maxWait: BACKUP_MAX_WAIT,
        })

        this.#loadFromStore()
    }

    #createItem(initialValues: ItemInitialValues) {
        return new Item(initialValues, this.extractData)
    }

    #createItemFile(props: CreateFileProps): [string, ItemFile] {
        const fileId = uuidv4()
        const itemFile = new ItemFile({
            props: {
                id: fileId,
                size: props.size,
                contentType: props.contentType,
            },
            source: props.source,
            isCreated: false,
            queue: this.client.uploadQueue,
        })
        return [fileId, itemFile]
    }

    async #loadFromStore() {
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
                            queue: this.client.uploadQueue,
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
                                queue: this.client.uploadQueue,
                            }),
                        )
                    }
                })
                remoteData = { content: remote.content, files: remoteFiles }
            }

            const isChanged = isItemChanged(localData, remoteData)
            const item = this.#createItem({
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
            { items: items.length, colrev },
            "Loaded items from the local store",
        )
        this.isLoadedFromStore = true
    }

    #send(msg: ClientMessage) {
        this.client.send(this.channel, msg)
    }

    dispose() {
        this.backupDebounced.cancel() // TODO maybe do last backup ?
        this.flushDebounced.cancel()
        this.#send({ kind: "sync_stop", col: this.col })
        this.status = CollectionStatus.SyncStopped
        this.client.closeChannel(this.channel)
    }

    onConnect() {
        this.status = CollectionStatus.SyncInProgress
        this.#send({
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
            this.#handleSyncCompleteMessage(msg)
        } else if (msg.kind === "sync_error") {
            this.#handleSyncErrorMessage(msg)
        } else if (msg.kind === "doc") {
            this.#handleDocMessage(msg)
        } else if (msg.kind === "update") {
            this.#handleUpdateMessage(msg)
        } else if (msg.kind === "delete") {
            this.#handleDeleteMessage(msg)
        } else if (msg.kind === "change_error") {
            this.#handleChangeErrorMessage(msg)
        } else if (msg.kind === "get_error") {
            this.#handleGetErrorMessage(msg)
        } else {
            this.logger.warn(
                { msg },
                "Received unexpected message type in the collection channel",
            )
        }
    }

    #handleSyncCompleteMessage(msg: SyncCompleteMessage) {
        this.colrev = msg.colrev
        this.#flush()
        this.status = CollectionStatus.SyncCompleted
        this.initialSyncCompleted = true
        this.logger.info("Collection sync completed")
        this.#backup()
    }

    #handleSyncErrorMessage(msg: SyncErrorMessage) {
        this.logger.warn({ msg }, "Sync error")
        this.status = CollectionStatus.SyncError
        this.client.closeChannel(this.channel)
    }

    #updateItemFiles(item: Item<any>, files: FileProps[]) {
        const remote = item.remote!

        // Create remote added files
        const remoteAddedFiles = files.filter((f) => !remote.files.has(f.id))
        remoteAddedFiles.forEach((props) => {
            const localFile = item.local?.files.get(props.id)
            if (localFile) {
                this.logger.debug(
                    { id: item.id, fileId: props.id },
                    "Acknowledged creation of the local file",
                )
                localFile.isCreated = true
                remote.files.set(localFile.props.id, localFile)
            } else {
                this.logger.debug(
                    { id: item.id, fileId: props.id },
                    "Received new file",
                )
                const file = new ItemFile({
                    props,
                    isCreated: true,
                    source: null,
                    queue: this.client.uploadQueue,
                })
                remote.files.set(props.id, file)
                item.local?.files.set(props.id, file)
            }
        })

        // Delete remote deleted files
        const remoteDeletedFiles = difference(
            [...remote.files.keys()],
            files.map((f) => f.id),
        )
        remoteDeletedFiles.map((id) => {
            this.logger.debug(
                { id: item.id, fileId: id },
                "Removed file from item",
            )
            item.local?.files.delete(id)
            remote.files.delete(id)
        })
    }

    #handleDocMessage(msg: DocMessage) {
        const { colrev, id, content, files, createdAt, updatedAt } = msg
        this.colrev = colrev

        if (content === null) {
            this.items.delete(id)
            this.#enqueueBackup(id)
            return
        }

        const doc = loroFromBase64(content)
        const item = this.items.get(id)
        if (item === undefined || item.state === ItemState.Error) {
            // Receive new document and create new item
            const filesMap = new Map(
                files.map((props) => [
                    props.id,
                    new ItemFile({
                        props,
                        source: null,
                        isCreated: true,
                        queue: this.client.uploadQueue,
                    }),
                ]),
            )
            const newItem = this.#createItem({
                id,
                remote: { content: doc, files: filesMap },
                local: { content: doc.fork(), files: new Map(filesMap) },
                state: ItemState.Synchronized,
                updatedAt: parseISO(updatedAt),
                createdAt: parseISO(createdAt),
            })
            this.items.set(id, newItem)
            this.logger.debug({ id }, "Received new doc")
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
            item.setState(
                isChanged ? ItemState.Changed : ItemState.Synchronized,
            )
            if (isChanged) {
                this.logger.debug({ id }, "Merged remote doc into local")
                this.flushQueue.add(id)
            } else {
                this.logger.debug(
                    { id },
                    "Received remote doc identical to local",
                )
                this.flushQueue.delete(id)
            }
        }
        this.#enqueueBackup(id)
    }

    #handleUpdateMessage(msg: ServerUpdateMessage) {
        const { colrev, id, contentUpdate, files, updatedAt } = msg
        this.colrev = colrev

        const item = this.items.get(id)

        if (!item) {
            this.logger.warn({ id }, "Can't apply changes, unknown doc")
            this.#send({ kind: "get", col: this.col, id })
            return
        }

        if (item.remote === null) {
            this.logger.warn({ id }, "Can't apply changes, doc is not created")
            this.#send({ kind: "get", col: this.col, id })
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
            } catch (error) {
                this.logger.warn(
                    { id, error },
                    "Can't import changes, loro error",
                )
                this.#send({ kind: "get", col: this.col, id })
                return
            }
        }

        this.#updateItemFiles(item, files)

        item.updatedAt = parseISO(updatedAt)

        this.logger.debug(
            { id },
            "Recieved and applied update to the existing doc",
        )

        // Update changed state
        const isChanged = isItemChanged(item.local, item.remote)
        item.setState(isChanged ? ItemState.Changed : ItemState.Synchronized)
        if (isChanged) {
            this.flushQueue.add(id)
        } else {
            this.flushQueue.delete(id)
        }

        this.#enqueueBackup(id)
    }

    #handleDeleteMessage(msg: ServerDeleteMessage) {
        const { colrev, id } = msg
        this.colrev = colrev
        const deleted = this.items.delete(id)
        if (!deleted) return
        // TODO remove items from queue
        this.logger.debug({ id }, "Deleted doc")
        this.#enqueueBackup(id)
    }

    #restoreItemRemoteState(item: Item<T>) {
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
            item.setState(ItemState.Synchronized)
        }
    }

    #handleChangeErrorMessage(msg: ChangeErrorMessage) {
        let { id, code } = msg

        const item = this.items.get(id)
        if (item === undefined) return

        this.logger.warn({ id, code }, "Rejected change for item")

        // Client is referencing document that does not exist on server
        // To not lose data client should re-create document
        if (code === "not_found") {
            this.logger.warn({ id }, "Document not found")
            item.remote = null
            this.flushQueue.add(id)
            return
        }

        if (code === "forbidden") {
            this.logger.warn({ id }, "Forbidden")
            this.#restoreItemRemoteState(item)
            return
        }

        if (code === "content_too_large") {
            this.logger.warn({ id }, "Content is too large")
            this.#restoreItemRemoteState(item)
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
        this.#send({ kind: "get", id, col: this.col })
    }

    #handleGetErrorMessage(msg: GetErrorMessage) {
        const { id, code } = msg
        this.logger.warn({ msg }, "Get error")
        if (code === "not_found") {
            this.logger.warn({ id }, "Document doesn't exist")
            this.items.delete(id)
        }
    }

    #enqueueBackup(id: string) {
        this.backupQueue.add(id)
        this.backupDebounced()
    }

    async #backup() {
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
            { items: clonedQueue.size },
            "Completed backup to the local store",
        )
    }

    #enqueueFileUpload(itemId: string, file: ItemFile) {
        this.client.uploadQueue.add({
            id: file.props.id,
            colId: this.col,
            size: file.props.size,
            source: file.source!, // TODO handle missing source
            onComplete: (status: UploadStatus) => {
                this.logger.debug(
                    { fileId: file.props.id, status },
                    "File upload finished",
                )
                this.flushQueue.add(itemId)
                this.flushImmediate()
            },
        })
    }

    #flush() {
        this.logger.debug({ items: this.flushQueue.size }, "Flushing changes")
        this.flushQueue.forEach((id) => {
            const item = this.items.get(id)
            if (item === undefined) return

            if (item.local !== null && item.remote === null) {
                // Check files upload status & enqueue uploads
                let isUploadIncomplete = false
                item.local.files.forEach((file) => {
                    const status = this.client.uploadQueue.getStatus(
                        file.props.id,
                    )
                    if (status === undefined) {
                        this.#enqueueFileUpload(item.id, file)
                        isUploadIncomplete = true
                        return
                    }
                    if (status.kind !== "completed") {
                        isUploadIncomplete = true
                    }
                })
                if (isUploadIncomplete) return // skip item

                const msg: ClientCreateMessage = {
                    kind: "create",
                    col: this.col,
                    id,
                    content: loroToBase64(item.local.content),
                    files: [...item.local.files.keys()],
                }
                this.#send(msg)
            } else if (item.local === null && item.remote !== null) {
                const msg: ClientDeleteMessage = {
                    kind: "delete",
                    col: this.col,
                    id,
                }
                this.#send(msg)
            } else if (item.local !== null && item.remote !== null) {
                const localFileIds = [...item.local.files.keys()]
                const remoteFileIds = [...item.remote.files.keys()]
                // Files that are in the local list, but not in the remote
                const locallyCreatedFiles = difference(
                    localFileIds,
                    remoteFileIds,
                )

                let isUploadIncomplete = false
                locallyCreatedFiles.map((fileId) => {
                    const file = item.local!.files.get(fileId)!
                    const status = this.client.uploadQueue.getStatus(fileId)
                    if (status === undefined) {
                        this.#enqueueFileUpload(item.id, file)
                        isUploadIncomplete = true
                        return
                    }
                    if (status.kind !== "completed") {
                        isUploadIncomplete = true
                    }
                })
                if (isUploadIncomplete) return // skip item

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
                this.#send(msg)
            }
            item.setState(ItemState.ChangesSent)
        })
        this.flushQueue.clear()
    }

    #onChangeItem(id: string, flushImmediate: boolean) {
        this.#enqueueBackup(id)
        this.flushQueue.add(id)
        if (this.status === CollectionStatus.SyncCompleted) {
            if (flushImmediate) {
                this.flushImmediate()
            } else {
                this.flushDebounced()
            }
        }
    }

    flushImmediate() {
        this.flushDebounced.cancel()
        this.#flush()
    }

    // Public API

    create(doc: LoroDoc, props?: CreateDocProps) {
        const { files = [] } = props ?? {}
        const id = uuidv4()
        this.items.set(
            id,
            this.#createItem({
                id,
                remote: null,
                local: {
                    content: new ObservableLoroDoc(doc),
                    files: new Map(files.map((f) => this.#createItemFile(f))),
                },
                state: ItemState.Changed,
                localUpdatedAt: new Date(),
            }),
        )
        this.#onChangeItem(id, true)
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
        item.setState(ItemState.Changed)
        this.#onChangeItem(id, false)
    }

    delete(id: string) {
        const item = this.items.get(id)
        if (!item) throw new Error(`No item with such id: "${id}"`)
        if (item.remote === null) {
            this.items.delete(id)
            return
        }
        // TODO remove files from queue
        item.local = null
        item.setState(ItemState.Changed)
        this.#onChangeItem(id, true)
    }

    addFile(id: string, props: CreateFileProps) {
        const item = this.items.get(id)
        if (!item) throw new Error(`No item with such id: "${id}"`)

        if (item.local === null) {
            throw new Error("Can't update deleted item: " + id)
        }

        const [fileId, file] = this.#createItemFile(props)
        item.local.files.set(fileId, file)
        item.setState(ItemState.Changed)
        this.#onChangeItem(id, true)

        return fileId
    }

    deleteFile(id: string, fileId: string) {
        const item = this.items.get(id)
        if (!item) throw new Error(`No item with such id: "${id}"`)

        if (item.local === null) {
            throw new Error("Can't update deleted item: " + id)
        }

        const deleted = item.local.files.delete(fileId)
        if (deleted) {
            // TODO remove from the queue
        }

        item.setState(ItemState.Changed)
        this.#onChangeItem(id, true)
    }
}

export { SinkronCollection, Item, ItemFile }
