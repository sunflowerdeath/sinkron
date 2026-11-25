const CHUNK_SIZE = 5 * 1024 * 1024 // 5Mb

export interface FileSource {
    getChunk(chunk: number): Promise<Blob | null>
}

class BlobFileSource implements FileSource {
    file: File

    constructor(file: File) {
        this.file = file
    }

    async getChunk(chunk: number) {
        if (chunk < 1) return null // Starts from 1

        let chunks = Math.ceil(this.file.size / CHUNK_SIZE)
        if (chunk > chunks) return null

        let start = (chunk - 1) * CHUNK_SIZE
        let end = Math.min(start + CHUNK_SIZE, this.file.size)
        let slice = this.file.slice(start, end)
        return new Blob([await slice.arrayBuffer()])
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

export { CHUNK_SIZE, BlobFileSource }
