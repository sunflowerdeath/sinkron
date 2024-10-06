import { App, AppModels } from "../app"
import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"
import * as Automerge from "@automerge/automerge"

type PublishProps = {
    docId: string
    spaceId: string
}

type PostPublishResult = {
    id: string
    spaceId: string
    publishedAt: Date
}

class PostService {
    constructor(app: App) {
        this.app = app
    }

    app: App

    async get(
        models: AppModels,
        id: string
    ): Promise<PostPublishResult | null> {
        const res = await models.posts.findOne({
            where: { id },
            select: { id: true, spaceId: true, publishedAt: true }
        })
        return res as PostPublishResult
    }

    async content(models: AppModels, id: string): Promise<string | null> {
        const res = await models.posts.findOne({
            where: { id },
            select: { content: true }
        })
        return res === null ? null : res.content
    }

    async #getDocContent(
        docId: string
    ): Promise<ResultType<string, RequestError>> {
        const doc = await this.app.sinkron.getDocument(docId)
        if (doc === null || doc.data === null) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Document doesn't exist",
                details: { docId }
            })
        }
        const automerge = Automerge.load(doc.data)
        return Result.ok(JSON.stringify(automerge.content))
    }

    async publish(
        models: AppModels,
        props: PublishProps
    ): Promise<ResultType<PostPublishResult, RequestError>> {
        const { docId, spaceId } = props

        // TODO check post already exists

        // TODO check that document is part of space

        const getContentRes = await this.#getDocContent(docId)
        if (!getContentRes.isOk) return getContentRes

        const insertRes = await models.posts.insert({
            id: docId,
            spaceId,
            content: getContentRes.value
        })
        const { publishedAt } = insertRes.generatedMaps[0]

        const updateRes =
            await this.app.sinkronServer.updateDocumentWithCallback(
                docId,
                (doc) => {
                    doc.isPublished = true
                }
            )
        if (!updateRes.isOk) {
            return Result.err({
                code: ErrorCode.InternalServerError,
                message: "Unknown error"
            })
        }

        return Result.ok({ id: docId, spaceId, publishedAt })
    }

    async update(
        models: AppModels,
        id: string
    ): Promise<ResultType<PostPublishResult, RequestError>> {
        const getContentRes = await this.#getDocContent(id)
        if (!getContentRes.isOk) return getContentRes

        await models.posts.update({ id }, { content: getContentRes.value })

        const updated = await this.get(models, id)
        if (updated === null) {
            return Result.err({
                code: ErrorCode.InternalServerError,
                message: "Unknown error"
            })
        }
        return Result.ok(updated)
    }

    async unpublish(
        models: AppModels,
        id: string
    ): Promise<ResultType<true, RequestError>> {
        const res = await models.posts.delete({ id })

        if (res.affected === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Post not found",
                details: { id }
            })
        }

        const updateRes =
            await this.app.sinkronServer.updateDocumentWithCallback(
                id,
                (doc) => {
                    doc.isPublished = false
                }
            )
        if (!updateRes.isOk) {
            return Result.err({
                code: ErrorCode.InternalServerError,
                message: "Unknown error"
            })
        }

        return Result.ok(true)
    }
}

export { PostService }
