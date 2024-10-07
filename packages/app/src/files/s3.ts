import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand
} from "@aws-sdk/client-s3"

import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"
import { ObjectStorage } from "../services/file"

export type S3Config = {
    region: string
    accessKeyId: string
    secretAccessKey: string
    endpoint: string
    bucket: string
}

class S3ObjectStorage implements ObjectStorage {
    constructor(config: S3Config) {
        this.config = config

        const { region, endpoint, accessKeyId, secretAccessKey } = config
        this.client = new S3Client({
            region,
            endpoint,
            credentials: { accessKeyId, secretAccessKey }
        })
    }

    config: S3Config
    client: S3Client

    async get(): Promise<ResultType<Buffer, RequestError>> {
        return Result.err({
            code: ErrorCode.InvalidRequest,
            message:
                "Method get() is not implemented for S3, use direct url access"
        })
    }

    async put(
        id: string,
        data: Buffer,
        contentType?: string
    ): Promise<ResultType<true, RequestError>> {
        const command = new PutObjectCommand({
            Bucket: this.config.bucket,
            Key: id,
            Body: data,
            ContentType: contentType
        })
        try {
            await this.client.send(command)
        } catch (error) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Couldn't upload object",
                details: { error }
            })
        }
        return Result.ok(true)
    }

    async delete(id: string): Promise<ResultType<true, RequestError>> {
        const command = new DeleteObjectCommand({
            Bucket: this.config.bucket,
            Key: id
        })
        try {
            await this.client.send(command)
        } catch (error) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Couldn't delete object",
                details: { error }
            })
        }
        return Result.ok(true)
    }

    async batchDelete(ids: string[]): Promise<ResultType<true, RequestError>> {
        const command = new DeleteObjectsCommand({
            Bucket: this.config.bucket,
            Delete: {
                Objects: ids.map((id) => ({ Key: id }))
            }
        })
        try {
            await this.client.send(command)
        } catch (error) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Couldn't delete objects",
                details: { error }
            })
        }
        return Result.ok(true)
    }
}

export { S3ObjectStorage }
