type Result<T, E> = { isOk: true; value: T } | { isOk: false; error: E }

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

// Queue

type InitFileUpload = {
    fileId: string
    colId: string
    size: number
    contentType: string
}

type UploadFileChunk = {
    fileId: string
    chunkNumber: number
    chunk: number // TODO
}


class FileApi {
    async initFileUpload(
        props: InitFileUpload,
    ): Promise<Result<undefined, string>> {
        return { isOk: false, error: "Not implemented" }
    }

    async uploadFileChunk(
        props: UploadFileChunk,
    ): Promise<Result<undefined, string>> {
        return { isOk: false, error: "Not implemented" }
    }
}

type FileProps = {
    id: string
    size: number
    contentType: string
}

type UploadError =
    | { kind: "missing_source" }
    | { kind: "read_chunk_error" }
    | { kind: "other" }

type UploadStatus =
    | { kind: "not_uploaded" }
    | { kind: "in_progress"; chunksUploaded: number }
    | { kind: "completed" }
    | { kind: "error"; error: UploadError }
    | { kind: "cancelled" }

type UploadQueueItem = {
    file: FileProps
    status: UploadStatus
}

class UploadQueue {
    queue: Map<string, UploadQueueItem>
    isStarted = false
    fileApi: FileApi

    add(file: FileProps) {
        if (this.queue.has(file.id)) {
            // already added
            return
        }
        this.queue.set(file.id, {
            file,
            status: { kind: "not_uploaded" },
        })
        if (!this.isStarted) this.start()
    }

    remove(fileId: string) {
        const item = this.queue.get(fileId)
        if (item !== undefined) {
            item.status = { kind: "cancelled" }
        }
        this.queue.delete(fileId)
    }

    start() {
        if (this.isStarted) return
        this.isStarted = true
        this.uploadIteration()
    }

    stop() {
        this.isStarted = false
    }

    onCompleteItemUpload(item: UploadQueueItem) {
        // Remove item from the queue
        this.queue.delete(item.file.id)
        // TODO move to completed uploads ? or next is for collection to
        // store the state (error / finished)
        // TODO Notify the collection
        // item.collection.onFinishFileUpload(item.file.id, item.status)
    }

    async uploadIteration() {
        if (!this.isStarted) {
            // queue is stopped
            return undefined
        }

        // get first item from the queue
        let item = this.queue.values().next().value
        if (item === undefined) {
            // queue is empty
            this.isStarted = false
            return
        }

        let { file } = item

        if (item.status.kind === "not_uploaded") {
            // Init upload
            let res = await this.fileApi.initFileUpload({
                fileId: file.id,
                colId: file.col,
                size: file.size,
                contentType: file.contentType,
            })
            if (!res.isOk) {
                item.status = { kind: "error", error: res.error }
                this.onCompleteItemUpload(item)
                return
            }
            item.status = { kind: "in_progress" }
        } else if (item.status.kind == "in_progress") {
            // Upload the next file chunk
            const chunkNumber = item.status.chunksUploaded + 1
            const chunk = await item.file.source.getChunk(chunkNumber)
            // TODO handle source error
            const res = await this.fileApi.uploadFileChunk({
                fileId: file.id,
                chunkNumber,
                chunk,
            })
            if (!res.isOk) {
                // Upload chunk error
                item.status = { kind: "error", error: res.error }
                this.onCompleteItemUpload(item)
                return
            }
            item.status.chunksUploaded += 1
            if (item.chunksUploaded == item.totalChunks) {
                // Uploaded successfully
                item.status = { kind: "completed" }
                this.onCompleteItemUpload(item)
            }
        } else {
            // Unexpected status, should not be in the queue
            this.queue.delete(item.file.id)
        }

        this.uploadIteration()
    }
}
