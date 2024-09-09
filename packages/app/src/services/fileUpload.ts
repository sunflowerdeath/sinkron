import { App, AppModels } from "../app"
import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"

export interface ObjectStorage {
    put(key: string, data: Buffer): Promise<ResultType<true, RequestError>>
    get(key: string): Promise<ResultType<Buffer, RequestError>>
}

export type FileUploadProps = {
    id: string
    spaceId: string
    content: Buffer
}

class FileUploadService {
    app: App
    storage: ObjectStorage

    constructor(app: App, storage: ObjectStorage) {
        this.app = app
        this.storage = storage
    }

    // async getSpaceUsedStorage(models: AppModels, spaceId: string) {}

    async get(models: AppModels, props: { spaceId: string; fileId: string }) {
        const { spaceId, fileId } = props
        return this.storage.get(`spaces-${spaceId}-file-${fileId}`)
    }

    async upload(
        models: AppModels,
        props: FileUploadProps
    ): Promise<ResultType<true, RequestError>> {
        const { spaceId, id, content } = props

        // check space exists
        // check file size limit
        // check total space limit

        return this.storage.put(`spaces-${spaceId}-file-${id}`, content)
    }
}

export { FileUploadService }
