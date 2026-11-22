import type { FileProps } from "./protocol"
import { FileApi } from "./fileApi"

const CHUNK_SIZE = 5 * 1024 * 1024 // 5Mb

export interface FileSource {
    getChunk(chunk: number): Promise<ArrayBuffer | null>
}

class BlobFileSource implements FileSource {
    file: File

    async getChunk(chunk: number) {
        let chunks = Math.ceil(this.file.size / CHUNK_SIZE)
        if (chunk > chunks) return null

        let start = chunk * CHUNK_SIZE
        let end = Math.max(start + CHUNK_SIZE, this.file.size)
        let slice = this.file.slice(start, end)
        return await slice.arrayBuffer()
    }
}

class LocalFileSource implements FileSource {
    path: string

    constructor(path: string) {
        this.path = path
    }

    async getChunk(chunk: number) {
        // TODO not implemented
        return null
    }
}

type UploadError =
    | { code: "missing_source" }
    | { code: "read_chunk_error" }
    | { code: "other" }
/*
    internal => retry (but max N attempts?)
    file api fetch / network error => retry
    SourceError
    | { code: "source_missing" } // status: error? => remove file?
    | { code: "chunk_read_error" } // status: error => MANUAL
    SinkronError
    | { code: "forbidden" } // delete file? what in case of local sync?
    | { code: "insufficient_storage" } // status: error, auto retry - how?
    | { code: "file_too_large" } // status: error => MANUAL
    | { code: "file_not_found" } // status: error => re-queue upload
    other => unknown/unexpected error => MANUAL
    */

type UploadInProgress = {
    kind: "in_progress"
    isInitialized: boolean
    chunksUploaded: number
}

type UploadFailed = {
    kind: "failed"
    error: UploadError
}

type UploadCompleted = { kind: "completed" }

type UploadStatus = UploadInProgress | UploadFailed | UploadCompleted

enum IterationResult {
    // Upload is not yet finished
    InProgress,
    // Upload have been finished, and queue should process next item
    Finished,
    // Operation couldn't be performed and it's needed to retry it with
    // an exponential backoff
    NeedRetry,
    // Item doesn't need any processing and should be skipped
    Skip,
}

type UploadQueueItem = {
    file: FileProps
    status: UploadStatus
    callback: () => void
}

class UploadQueue {
    // All items including pending, successfully completed and failed
    items: Map<string, UploadQueueItem>
    // Pending and in-progress uploads
    pendingItems: UploadQueueItem[]
    isStarted = false
    fileApi: FileApi
    exponentialBackoff: ExponentialBackoff

    constructor() {
        this.exponentialBackoff = new ExponentialBackoff({
            initialTimeout: 333,
            maxTimeout: 10000,
        })
    }

    getUploadStatus(id: string): UploadStatus | undefined {
        return this.items.get(id)?.status
    }

    add(file: FileProps, callback: () => void) {
        // Already added
        if (this.items.has(file.id)) return

        const item: UploadQueueItem = {
            file,
            status: {
                kind: "in_progress",
                isInitialized: false,
                chunksUploaded: 0,
            },
            callback,
        }
        this.items.set(file.id, item)
        this.pendingItems.push(item)

        if (!this.isStarted) this.start()
    }

    remove(fileId: string) {
        this.items.delete(fileId)
        const index = this.pendingItems.findIndex(
            (item) => item.file.id === fileId,
        )
        if (index !== -1) this.pendingItems.splice(index, 1)
    }

    start() {
        if (this.isStarted) return
        this.isStarted = true
        this.performIteration()
    }

    stop() {
        this.isStarted = false
        this.exponentialBackoff.reset()
    }

    async performIteration() {
        if (!this.isStarted) return

        const item = this.pendingItems[0]
        if (item === undefined) {
            // Queue is empty
            this.isStarted = false
            return
        }

        const result = await this.performItemIteration(item)

        switch (result) {
            case IterationResult.InProgress: {
                this.exponentialBackoff.reset()
                this.performIteration()
            }
            case IterationResult.Finished: {
                this.pendingItems.shift()
                item.callback()
                this.exponentialBackoff.reset()
                this.performIteration()
            }
            case IterationResult.NeedRetry: {
                this.exponentialBackoff.schedule(() => {
                    this.performIteration()
                })
            }
            case IterationResult.Skip: {
                this.pendingItems.shift()
                this.performIteration()
            }
        }
    }

    async performItemIteration(
        item: UploadQueueItem,
    ): Promise<IterationResult> {
        const { file, status } = item

        // Unexpected status, should skip
        if (status.kind !== "in_progress") return IterationResult.Skip

        // Initialize upload
        if (!status.isInitialized) {
            let res = await this.fileApi.initFileUpload({
                colId: file.col,
                fileId: file.id,
                size: file.size,
                // contentType: file.contentType,
            })
            if (!res.isOk) {
                // Initialization failed
                // TODO handle error types: retry / global handler / error status
                item.status = { kind: "failed", error: res.error }
                return IterationResult.Finished
            }

            // Initialized successfully
            status.isInitialized = true
            return IterationResult.InProgress
        }

        // Upload the next file chunk
        const chunkNumber = status.chunksUploaded + 1
        const chunk = await item.file.source.getChunk(chunkNumber)
        // TODO handle source error

        const res = await this.fileApi.uploadFileChunk({
            fileId: file.id,
            chunkNumber,
            chunk,
        })
        if (!res.isOk) {
            // TODO handle error types: retry / global handler / error status
            item.status = { kind: "failed", error: res.error }
            return IterationResult.Finished
        }

        // Chunk uploaded succesfully
        const totalChunks = 5 // TODO
        if (status.chunksUploaded < totalChunks) {
            status.chunksUploaded += 1
            return IterationResult.InProgress
        } else {
            item.status = { kind: "completed" }
            return IterationResult.Finished
        }
    }
}

type ExponentialBackoffProps = {
    initialTimeout: number
    maxTimeout: number
}

class ExponentialBackoff {
    props: ExponentialBackoffProps
    currentTimeout: number
    timer?: ReturnType<typeof setTimeout>

    constructor(props: ExponentialBackoffProps) {
        this.props = props
        this.currentTimeout = this.props.initialTimeout
    }

    schedule(cb: () => void) {
        clearTimeout(this.timer)
        this.timer = setTimeout(() => cb(), this.currentTimeout)
        this.currentTimeout = Math.min(
            this.props.maxTimeout,
            this.currentTimeout * 2,
        )
    }

    reset() {
        this.currentTimeout = this.props.initialTimeout
        clearTimeout(this.timer)
    }
}

export { UploadQueue }
