import { makeObservable, observable, observableShallow } from "mobx"

import { type ApiError, FileApi } from "./fileApi"
import { type FileSource, CHUNK_SIZE } from "./fileSource"
import { type SinkronError } from "./protocol"
import { ExponentialBackoff } from "./utils/exponentialBackoff"

export type UploadInProgress = {
    kind: "in_progress"
    isInitialized: boolean
    chunksUploaded: number
}

export type UploadError =
    | { code: "chunk_read_error" }
    | SinkronError
    | { code: "unexpected_server_error"; error: any }

export type UploadFailed = {
    kind: "failed"
    error: UploadError
}

export type UploadCompleted = { kind: "completed" }

export type UploadStatus = UploadInProgress | UploadFailed | UploadCompleted

const INITIAL_STATUS: UploadStatus = {
    kind: "in_progress",
    isInitialized: false,
    chunksUploaded: 0,
}

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
    onComplete: (status: UploadStatus) => void
}

type UploadQueueItem = AddFileProps & {
    status: UploadStatus
}

class UploadQueue {
    // All items including pending, successfully completed and failed
    items: Map<string, UploadQueueItem> = new Map()

    pendingItems: UploadQueueItem[] = []
    currentItem?: UploadQueueItem

    isRunning = false
    fileApi: FileApi
    exponentialBackoff: ExponentialBackoff

    constructor(fileApi: FileApi) {
        this.fileApi = fileApi
        this.exponentialBackoff = new ExponentialBackoff({
            initialTimeout: 333,
            maxTimeout: 10000,
        })

        makeObservable(this, {
            items: observableShallow,
            isRunning: observable,
        })
    }

    getStatus(id: string): UploadStatus | undefined {
        return this.items.get(id)?.status
    }

    add(props: AddFileProps) {
        // Already added
        if (this.items.has(props.id)) return

        const item: UploadQueueItem = {
            ...props,
            status: INITIAL_STATUS,
        }
        this.items.set(props.id, item)
        this.pendingItems.push(item)

        if (!this.isRunning) this.start()
    }

    remove(fileId: string) {
        this.items.delete(fileId)

        const index = this.pendingItems.findIndex((item) => item.id === fileId)
        if (index !== -1) this.pendingItems.splice(index, 1)

        if (this.currentItem?.id === fileId) {
            this.currentItem = undefined
            this.exponentialBackoff.reset()
        }
    }

    requeue(fileId: string): boolean {
        const item = this.items.get(fileId)
        if (!item) return false

        const newItem = { ...item, status: INITIAL_STATUS }
        this.remove(fileId)
        this.add(newItem)
        return true
    }

    start() {
        if (this.isRunning) return
        this.isRunning = true
        this.performIteration()
    }

    stop() {
        this.isRunning = false
        this.exponentialBackoff.reset()
    }

    async performIteration() {
        if (!this.isRunning) return

        let currentItem = this.currentItem
        if (currentItem === undefined) {
            const nextItem = this.pendingItems.shift()
            if (nextItem !== undefined) {
                currentItem = this.currentItem = nextItem
            } else {
                // Queue is empty
                this.isRunning = false
                return
            }
        }

        const result = await this.performItemIteration(currentItem)

        switch (result) {
            case IterationResult.InProgress:
                this.exponentialBackoff.reset()
                this.performIteration()
                break
            case IterationResult.Finished:
                // Checks that current item have not beed cancelled
                if (currentItem === this.currentItem) {
                    currentItem.onComplete(currentItem.status)
                }
                this.currentItem = undefined
                this.exponentialBackoff.reset()
                this.performIteration()
                break
            case IterationResult.NeedRetry:
                this.exponentialBackoff.schedule(() => {
                    this.performIteration()
                })
                break
            case IterationResult.Skip:
                this.currentItem = undefined
                this.performIteration()
                break
        }
    }

    handleItemUploadError(
        item: UploadQueueItem,
        error: ApiError,
    ): IterationResult {
        switch (error.kind) {
            case "request_error":
                return IterationResult.NeedRetry
            case "response_parse_error":
                item.status = {
                    kind: "failed",
                    error: {
                        code: "unexpected_server_error",
                        error,
                    },
                }
                return IterationResult.Finished
            case "server_error":
                item.status = { kind: "failed", error: error.error }
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
                // TODO contentType
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
        status.chunksUploaded += 1
        const totalChunks = Math.ceil(item.size / CHUNK_SIZE)
        if (status.chunksUploaded === totalChunks) {
            item.status = { kind: "completed" }
            return IterationResult.Finished
        } else {
            return IterationResult.InProgress
        }
    }
}

export { UploadQueue }
