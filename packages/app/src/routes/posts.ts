import { FastifyInstance } from "fastify"

import { App } from "../app"

type PostCreateBody = { docId: string; spaceId: string }

const postCreateBodySchema = {
    type: "object",
    properties: {
        docId: { type: "string", format: "uuid" },
        spaceId: { type: "string", format: "uuid" }
    },
    required: ["docId", "spaceId"],
    additionalProperties: false
}

const postsRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.post<{ Body: PostCreateBody }>(
        "/posts/new",
        { schema: { body: postCreateBodySchema } },
        async (request, reply) => {
            const { docId, spaceId } = request.body
            const role = await app.services.spaces.getMemberRole(app.models, {
                userId: request.token.userId,
                spaceId
            })
            if (role === null || !["admin", "owner"].includes(role)) {
                reply.code(500).send({ error: { message: "Not permitted" } })
                return
            }

            const res = await app.services.posts.publish(app.models, {
                docId,
                spaceId
            })
            if (!res.isOk) {
                reply.code(500).send(res.error)
                return
            }

            reply.send(res.value)
        }
    )

    fastify.post<{ Params: { postId: string } }>(
        "/posts/:postId/update",
        async (request, reply) => {
            const { postId } = request.params
            const post = await app.services.posts.get(app.models, postId)
            if (post === null) {
                reply.code(500).send({ error: { message: "Post not found" } })
                return
            }

            const role = await app.services.spaces.getMemberRole(app.models, {
                userId: request.token.userId,
                spaceId: post.spaceId
            })
            if (role === null || !["admin", "owner"].includes(role)) {
                reply.code(500).send({ error: { message: "Not permitted" } })
                return
            }

            const updateRes = await app.services.posts.update(
                app.models,
                postId
            )
            if (!updateRes.isOk) {
                reply
                    .code(500)
                    .send({ error: { message: "Couldn't update post" } })
                return
            }

            reply.send(updateRes.value)
        }
    )

    fastify.post<{ Params: { postId: string } }>(
        "/posts/:postId/unpublish",
        async (request, reply) => {
            const { postId } = request.params

            const post = await app.services.posts.get(app.models, postId)
            if (post === null) {
                reply.code(500).send({ error: { message: "Post not found" } })
                return
            }

            const role = await app.services.spaces.getMemberRole(app.models, {
                userId: request.token.userId,
                spaceId: post.spaceId
            })
            if (role === null || !["admin", "owner"].includes(role)) {
                reply.code(500).send({ error: { message: "Not permitted" } })
                return
            }

            const unpublishRes = await app.services.posts.unpublish(
                app.models,
                postId
            )
            if (!unpublishRes.isOk) {
                reply
                    .code(500)
                    .send({ error: { message: "Couldn't unpublish post" } })
                return
            }

            reply.send({})
        }
    )

    fastify.get<{ Params: { postId: string } }>(
        "/posts/:postId",
        async (request, reply) => {
            const { postId } = request.params

            const post = await app.services.posts.get(app.models, postId)
            if (post === null) {
                reply.code(500).send({
                    error: {
                        message: "Post not found",
                        code: "not_found"
                    }
                })
                return
            }
            reply.send(post)
        }
    )
}

export default postsRoutes
