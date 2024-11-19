import { LoroDoc } from "loro-crdt"

import { App, AppModels } from "../app"
import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"

type PostProps = {
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
        props: PostProps
    ): Promise<ResultType<string, RequestError>> {
        const { docId, spaceId } = props
        const res = await this.app.sinkron.getDocument({
            id: docId,
            col: `spaces/${spaceId}`
        })
        if (!res.isOk) {
            return Result.err({
                code: ErrorCode.InternalServerError, // TODO
                message: "Couldn't get document",
                details: props
            })
        }
        const doc = res.value
        if (doc.data === null) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Document doesn't exist",
                details: props
            })
        }
        const content = LoroDoc.fromSnapshot(doc.data).toJSON()
        return Result.ok(JSON.stringify(content.root.content))
    }

    async publish(
        models: AppModels,
        props: PostProps
    ): Promise<ResultType<PostPublishResult, RequestError>> {
        const { docId, spaceId } = props

        // TODO check if post already exists

        const getContentRes = await this.#getDocContent(props)
        if (!getContentRes.isOk) return getContentRes

        const insertRes = await models.posts.insert({
            id: docId,
            spaceId,
            content: getContentRes.value
        })
        const { publishedAt } = insertRes.generatedMaps[0]

        const updateRes = await this.app.sinkron.updateDocumentWithCallback({
            id: docId,
            col: `spaces/${spaceId}`,
            cb: (doc) => {
                doc.getMap("root").set("isPublished", true)
            }
        })
        if (!updateRes.isOk) {
            return Result.err({
                code: ErrorCode.InternalServerError,
                message: "Couldn't update document"
            })
        }

        return Result.ok({ id: docId, spaceId, publishedAt })
    }

    async update(
        models: AppModels,
        props: PostProps
    ): Promise<ResultType<PostPublishResult, RequestError>> {
        const getContentRes = await this.#getDocContent(props)
        if (!getContentRes.isOk) return getContentRes

        await models.posts.update(
            { id: props.docId },
            { content: getContentRes.value }
        )

        const updated = await this.get(models, props.docId)
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
        props: PostProps
    ): Promise<ResultType<true, RequestError>> {
        const { docId, spaceId } = props

        const res = await models.posts.delete({ id: docId })

        if (res.affected === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Post not found",
                details: props
            })
        }

        const updateRes = await this.app.sinkron.updateDocumentWithCallback({
            id: docId,
            col: `spaces/${spaceId}`,
            cb: (doc) => {
                doc.getMap("root").set("isPublished", false)
            }
        })
        if (!updateRes.isOk) {
            return Result.err({
                code: ErrorCode.InternalServerError,
                message: "Couldn't update document"
            })
        }

        return Result.ok(true)
    }
}

export { PostService }
