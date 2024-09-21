import { v4 as uuidv4 } from "uuid"
import { difference, sum } from "lodash"
import { In } from "typeorm"

import { App, AppModels } from "../app"
import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"

interface FileStorage {
    put(id: string, data: Buffer): Promise<ResultType<true, RequestError>>
    get(id: string): Promise<ResultType<Buffer, RequestError>>
    delete(id: string): Promise<ResultType<true, RequestError>>
    batchDelete(ids: string[]): Promise<ResultType<true, RequestError>>
}

type UploadFileProps = {
    spaceId: string
    data: Buffer
}

const storageLimit = 100 * 1024 * 1024 // 100Mb
const maxUploadFileSize = 5 * 1024 * 1024 // 5Mb

type FileServiceProps = {
    app: App
    storage: FileStorage
}

class FileService {
    constructor(props: FileServiceProps) {
        this.app = props.app
        this.storage = props.storage
    }

    app: App
    storage: FileStorage

    async uploadFile(
        models: AppModels,
        props: UploadFileProps
    ): Promise<ResultType<string, RequestError>> {
        const { data, spaceId } = props

        const space = await models.spaces.findOne({
            where: { id: spaceId },
            select: { id: true, usedStorage: true }
        })
        if (space === null) {
            return Result.err({
                code: ErrorCode.UnprocessableRequest,
                message: "Space not found"
            })
        }

        const fileSize = data.length
        if (fileSize > maxUploadFileSize) {
            return Result.err({
                code: ErrorCode.UnprocessableRequest,
                message:
                    "File is too big, max allowed size is " + maxUploadFileSize
            })
        }

        const availableStorage = storageLimit - space.usedStorage
        if (fileSize > availableStorage) {
            return Result.err({
                code: ErrorCode.UnprocessableRequest,
                message: "Not enough storage space"
            })
        }

        const id = uuidv4()
        const res = await this.storage.put(id, data)
        if (!res.isOk) return res

        await models.files.create({ id, spaceId, size: fileSize })

        await models.spaces.update(spaceId, {
            usedStorage: () => `used_storage + ${fileSize}`
        })

        return Result.ok(id)
    }

    async deleteFile(
        models: AppModels,
        id: string
    ): Promise<ResultType<true, RequestError>> {
        const file = await models.files.findOne({
            where: { id },
            select: { spaceId: true, size: true }
        })
        if (file === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "File not found"
            })
        }

        const res = await this.storage.delete(id)
        if (!res.isOk) return res

        await models.files.delete({ id })

        await models.spaces.update(file.spaceId, {
            usedStorage: () => `used_storage - ${file.size}`
        })

        return Result.ok(true)
    }

    async batchDeleteFiles(
        models: AppModels,
        props: { spaceId: string; fileIds: string[] }
    ): Promise<ResultType<true, RequestError>> {
        const { spaceId, fileIds } = props

        const where = { id: In(fileIds), spaceId }
        const files = await models.files.find({
            where,
            select: { spaceId: true, id: true, size: true }
        })
        
        await this.storage.batchDelete(fileIds)
        
        await models.files.delete(where)

        const deletedFilesSize = sum(files.map((f) => f.size))
        await models.spaces.update(spaceId, {
            usedStorage: () => `used_storage - ${deletedFilesSize}`
        })

        return Result.ok(true)
    }

    async orphanCheck(models: AppModels, spaceId: string) {
        const files = await models.files.find({
            where: { spaceId },
            select: { id: true }
        })
        const uploadedFileIds = files.map((f) => f.id)

        if (uploadedFileIds.length === 0) return

        const col = `spaces/${spaceId}`
        const res = await this.sinkron.syncCollection(col)
        if (!res.isOk) return
        const usedFileIds = res.value.documents.map((doc) => {
            const automerge = Automerge.load(doc.data)
            return scanDocumentForAttachments(automerge.content)
        })

        const orphanIds = difference(uploadedFileIds, usedFileIds)
        await this.batchDeleteFiles(models, orphanIds)
    }
}

export { FileService }
