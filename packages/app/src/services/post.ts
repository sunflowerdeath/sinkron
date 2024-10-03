import { App, AppModels } from "../app"
import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"
import * as Automerge from "@automerge/automerge"

type PublishProps = {
    docId: string
    spaceId: string
}

type PublishResult = {
    docId: string
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
    ): Promise<ResultType<Post, RequestError>> {
        const post = await models.posts.findOne({
            where: { docId: id },
            select: { docId: true, content: true }
        })

        if (post === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Post not found",
                details: { id }
            })
        }

        return Result.ok(post)
    }

    async publish(
        models: AppModels,
        props: PublishProps
    ): Promise<ResultType<PublishResult, RequestError>> {
        const { docId, spaceId } = props

        const doc = await this.app.sinkron.getDocument(docId)
        if (doc === null || doc.data === null) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Document doesn't exist",
                details: { docId }
            })
        }

        // TODO check col

        const automerge = Automerge.load(doc.data)

        const res = await models.posts.insert({
            docId,
            spaceId,
            content: JSON.stringify(automerge.content)
        })
        const { publishedAt } = res.generatedMaps[0]

        const updateRes = await this.app.sinkron.updateDocumentWithCallback(
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

        return Result.ok({ docId, spaceId, publishedAt })
    }

    // async update(
        // models: AppModels,
        // id: string
    // ): Promise<ResultType<PublishResult, RequestError>> {
    // }

    async unpublish(
        models: AppModels,
        id: string
    ): Promise<ResultType<true, RequestError>> {
        const res = await models.posts.deleteBy({ id })

        if (res.affectedRows === 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Post doesn't exist",
                details: { id }
            })
        }

        const updateRes = await this.app.sinkron.updateDocumentWithCallback(
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
