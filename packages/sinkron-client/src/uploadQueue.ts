import { type ApiError, FileApi } from "./fileApi"
import { ExponentialBackoff } from "./utils/exponentialBackoff"

const CHUNK_SIZE = 5 * 1024 * 1024 // 5Mb

export interface FileSource {
    getChunk(chunk: number): Promise<ArrayBuffer | null>
}

class BlobFileSource implements FileSource {
    file: File

    constructor(file: File) {
        this.file = file
    }

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
    | { code: "chunk_read_error" }
    | { code: "forbidden" }
    | { code: "insufficient_storage" }
    | { code: "file_too_large" }
    | { code: "file_not_found" }
    | { code: "unexpected_server_error"; error: any }

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

export type AddFileProps = {
    id: string
    colId: string
    size: number
    source: FileSource
    onComplete: () => void
}

type UploadQueueItem = AddFileProps & {
    status: UploadStatus
}

class UploadQueue {
    // All items including pending, successfully completed and failed
    items: Map<string, UploadQueueItem> = new Map()
    // Pending and in-progress uploads
    pendingItems: UploadQueueItem[] = []
    isStarted = false
    fileApi: FileApi
    exponentialBackoff: ExponentialBackoff

    constructor(fileApi: FileApi) {
        this.fileApi = fileApi
        this.exponentialBackoff = new ExponentialBackoff({
            initialTimeout: 333,
            maxTimeout: 10000,
        })
    }

    getUploadStatus(id: string): UploadStatus | undefined {
        return this.items.get(id)?.status
    }

    add(props: AddFileProps) {
        // Already added
        if (this.items.has(props.id)) return

        const item: UploadQueueItem = {
            ...props,
            status: {
                kind: "in_progress",
                isInitialized: false,
                chunksUploaded: 0,
            },
        }
        this.items.set(props.id, item)
        this.pendingItems.push(item)

        if (!this.isStarted) this.start()
    }

    remove(fileId: string) {
        this.items.delete(fileId)
        const index = this.pendingItems.findIndex((item) => item.id === fileId)
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
                item.onComplete()
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

    handleItemUploadError(
        item: UploadQueueItem,
        error: ApiError,
    ): IterationResult {
        switch (error.kind) {
            case "request_error":
                return IterationResult.NeedRetry
            case "parse_error":
                item.status = {
                    kind: "failed",
                    error: {
                        code: "unexpected_server_error",
                        error,
                    },
                }
                return IterationResult.Finished
            case "application_error":
                const code = error.error.code
                let uploadError: UploadError
                // Narrow down irrelevant error codes
                if (
                    [
                        "forbidden",
                        "insufficient_storage",
                        "file_too_large",
                        "file_not_found",
                    ].includes(code)
                ) {
                    uploadError = { code } as UploadError
                } else {
                    uploadError = {
                        code: "unexpected_server_error",
                        error,
                    }
                }
                item.status = { kind: "failed", error: uploadError }
                return IterationResult.Finished
        }
    }

    async performItemIteration(
        item: UploadQueueItem,
    ): Promise<IterationResult> {
        const { id, colId, size, status } = item

        // Unexpected status, should skip
        if (status.kind !== "in_progress") return IterationResult.Skip

        // Initialize upload
        if (!status.isInitialized) {
            let res = await this.fileApi.initFileUpload({
                colId,
                fileId: id,
                size,
                // contentType: file.contentType,
            })
            if (!res.isOk) {
                return this.handleItemUploadError(item, res.error)
            }

            // Initialized successfully
            status.isInitialized = true
            return IterationResult.InProgress
        }

        // Upload the next file chunk
        const chunkNumber = status.chunksUploaded + 1
        const data = await item.source.getChunk(chunkNumber)
        if (data === null) {
            item.status = {
                kind: "failed",
                error: { code: "chunk_read_error" },
            }
            return IterationResult.Finished
        }

        const res = await this.fileApi.uploadFileChunk({
            colId,
            fileId: id,
            chunkNumber,
            data: new Blob([data]),
        })
        if (!res.isOk) {
            return this.handleItemUploadError(item, res.error)
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

export { UploadQueue }
