// import { v4 as uuidv4 } from "uuid"
import sharp from "sharp"
import { In } from "typeorm"
import { sum } from "lodash"

import { App, AppModels } from "../app"
import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"

export interface ObjectStorage {
    put(
        id: string,
        data: Buffer,
        contentType?: string
    ): Promise<ResultType<true, RequestError>>
    get(id: string): Promise<ResultType<Buffer, RequestError>>
    delete(id: string): Promise<ResultType<true, RequestError>>
    batchDelete(ids: string[]): Promise<ResultType<true, RequestError>>
}

type UploadFileProps = {
    spaceId: string
    fileId: string
    data: Buffer
    contentType?: string
}

const spaceStorageLimit = 100 * 1024 * 1024 // 100Mb
const maxUploadFileSize = 5 * 1024 * 1024 // 5Mb

const maxImageDimensions = 2048

type FileServiceProps = {
    app: App
    storage: ObjectStorage
}

class FileService {
    constructor(props: FileServiceProps) {
        this.app = props.app
        this.storage = props.storage
    }

    app: App
    storage: ObjectStorage

    async uploadFile(
        models: AppModels,
        props: UploadFileProps
    ): Promise<ResultType<true, RequestError>> {
        const { data, spaceId, fileId, contentType } = props

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

        const availableStorage = spaceStorageLimit - space.usedStorage
        if (fileSize > availableStorage) {
            return Result.err({
                code: ErrorCode.UnprocessableRequest,
                message: "Not enough storage space in the space"
            })
        }

        const res = await this.storage.put(fileId, data, contentType)
        if (!res.isOk) return res

        await models.files.insert({ id: fileId, spaceId, size: fileSize })
        await models.spaces.update(spaceId, {
            usedStorage: () => `usedStorage + ${fileSize}`
        })
        return Result.ok(true)
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

    async processImage(
        data: Buffer
    ): Promise<ResultType<Buffer, RequestError>> {
        try {
            let image = sharp(data)
            const { width, height } = await image.metadata()
            if (width === undefined || height === undefined) {
                return Result.err({
                    code: ErrorCode.InvalidRequest,
                    message: "Couldn't process image file"
                })
            }
            if (width > maxImageDimensions || height > maxImageDimensions) {
                const largerDimension = width > height ? "width" : "height"
                image = image.resize({ [largerDimension]: maxImageDimensions })
            }
            const res = await image.jpeg({ quality: 87 }).toBuffer()
            return Result.ok(res)
        } catch {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Couldn't process image file"
            })
        }
    }

    async uploadImage(
        models: AppModels,
        props: UploadFileProps
    ): Promise<ResultType<true, RequestError>> {
        const res = await this.processImage(props.data)
        if (!res.isOk) return res
        const uploadRes = await this.uploadFile(models, {
            ...props,
            data: res.value,
            contentType: "image/jpeg"
        })
        return uploadRes
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
        await this.storage.batchDelete(files.map((f) => f.id))
        await models.files.delete(where)

        const deletedFilesSize = sum(files.map((f) => f.size))
        await models.spaces.update(spaceId, {
            usedStorage: () => `usedStorage - ${deletedFilesSize}`
        })

        return Result.ok(true)
    }

    async deleteOrphanFiles(models: AppModels, spaceId: string) {
        const files = await models.files.find({
            where: { spaceId },
            select: { id: true }
        })
        const uploadedFileIds = files.map((f) => f.id)

        if (uploadedFileIds.length === 0) return

        /*
        TODO
        const col = `spaces/${spaceId}`
        const res = await this.app.sinkron.syncCollection(col)
        if (!res.isOk) return

        const usedFileIds = res.value.documents.map((doc) => {
            if (doc.data === null) return []
            const automerge = Automerge.load(doc.data)
            if (automerge.meta) return []
            const ids: string[] = automerge.content.children
                .filter((node) => node.type === "image")
                .map((node) => node.id)
            return ids
        })
        const orphanIds = difference(uploadedFileIds, union(...usedFileIds))
        if (orphanIds.length > 0) {
            await this.batchDeleteFiles(models, { spaceId, fileIds: orphanIds })
        }
        */
    }
}

export { FileService }
