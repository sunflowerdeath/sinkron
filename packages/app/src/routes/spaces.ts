import { FastifyInstance } from "fastify"
import { Not, Equal } from "typeorm"

import { App } from "../app"

const uploadFileSizeLimit = 20 * 1024 * 1024 // 20Mb

type SpaceCreateBody = { name: string }

const spaceCreateRenameSchema = {
    type: "object",
    properties: {
        name: { type: "string", minLength: 1 } // TODO proper validdtion
    },
    required: ["name"],
    additionalProperties: false
}

const spaceParamsSchema = {
    type: "object",
    properties: {
        spaceId: { type: "string", format: "uuid" }
    },
    required: ["spaceId"],
    additionalProperties: false
}

const spacesRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.post<{ Body: SpaceCreateBody }>(
        "/spaces/new",
        { schema: { body: spaceCreateRenameSchema } },
        async (request, reply) => {
            const { name } = request.body
            await app.transaction(async (models) => {
                const res = await app.services.spaces.create(models, {
                    name,
                    ownerId: request.token.userId
                })
                if (!res.isOk) {
                    reply.code(500).send(res.error)
                    return
                }
                reply.send(res.value)
            })
        }
    )

    fastify.post<{ Params: { spaceId: string }; Body: { name: string } }>(
        "/spaces/:spaceId/rename",
        {
            schema: { body: spaceCreateRenameSchema, params: spaceParamsSchema }
        },
        async (request, reply) => {
            const { spaceId } = request.params
            const { name } = request.body
            const role = await app.services.spaces.getMemberRole(app.models, {
                userId: request.token.userId,
                spaceId
            })
            if (role === null || !["admin", "owner"].includes(role)) {
                reply.code(500).send()
                return
            }

            await app.services.spaces.rename(app.models, spaceId, name)
            reply.send({})
        }
    )

    fastify.post<{ Params: { spaceId: string } }>(
        "/spaces/:spaceId/delete",
        { schema: { params: spaceParamsSchema } },
        async (request, reply) => {
            const { spaceId } = request.params
            const space = await app.models.spaces.findOne({
                where: { id: spaceId },
                select: { ownerId: true }
            })
            if (space === null || space.ownerId !== request.token.userId) {
                reply.code(500).send()
                return
            }
            await app.transaction(async (models) => {
                const res = await app.services.spaces.delete(models, spaceId)
                if (!res.isOk) {
                    reply.code(500).send(res.error)
                    return
                }
                reply.send({})
            })
        }
    )

    fastify.post<{ Params: { spaceId: string } }>(
        "/spaces/:spaceId/leave",
        { schema: { params: spaceParamsSchema } },
        async (request, reply) => {
            const { spaceId } = request.params
            const res = await app.models.members.delete({
                spaceId,
                userId: request.token.userId,
                role: Not(Equal("owner"))
            })
            if (res.affected === 0) {
                reply.code(500).send({ error: { message: "Invalid request" } })
                return
            }
            reply.send({})
        }
    )

    fastify.get<{ Params: { spaceId: string } }>(
        "/spaces/:spaceId/members",
        { schema: { params: spaceParamsSchema } },
        async (request, reply) => {
            const { spaceId } = request.params
            const userId = request.token.userId

            const count = await app.models.members.count({
                where: { userId, spaceId }
            })
            if (count === 0) {
                reply.code(500).send()
                return
            }

            await app.transaction(async (models) => {
                const members = await app.services.spaces.getMembers(
                    models,
                    spaceId
                )
                const invites =
                    await app.services.invites.getSpaceActiveInvites(
                        models,
                        spaceId
                    )
                reply.send({ members, invites })
            })
        }
    )

    fastify.post("/spaces/:id/members/:member/update", () => {
        // update member of a space (change role)
        // TODO
    })

    fastify.post<{ Params: { spaceId: string; userId: string } }>(
        "/spaces/:spaceId/members/:userId/remove",
        async (request, reply) => {
            const { spaceId, userId } = request.params

            const memberRole = await app.services.spaces.getMemberRole(
                app.models,
                { userId, spaceId }
            )
            if (memberRole === null) {
                reply.code(500).send({ error: { message: "Member not found" } })
                return
            }

            const currentUserRole = await app.services.spaces.getMemberRole(
                app.models,
                { userId: request.token.userId, spaceId }
            )
            const isPermitted =
                currentUserRole !== null &&
                memberRole !== "owner" &&
                (memberRole === "admin"
                    ? currentUserRole === "owner"
                    : ["admin", "owner"].includes(currentUserRole))
            if (!isPermitted) {
                reply.code(500).send({ error: { message: "Not permitted" } })
                return
            }

            await app.models.members.delete({ id: userId })
            reply.send({})
        }
    )

    fastify.post<{ Body: Buffer; Params: { spaceId: string; fileId: string } }>(
        "/spaces/:spaceId/upload_image/:fileId",
        { bodyLimit: uploadFileSizeLimit },
        async (request, reply) => {
            const { spaceId, fileId } = request.params

            const role = await app.services.spaces.getMemberRole(app.models, {
                userId: request.token.userId,
                spaceId
            })
            if (role === null || !["admin", "owner", "editor"].includes(role)) {
                reply.code(500).send({ error: { message: "Not permitted" } })
                return
            }

            const res = await app.services.file.uploadImage(app.models, {
                data: request.body,
                spaceId,
                fileId
            })
            if (!res.isOk) {
                reply.code(500).send({ error: res.error })
                return
            }

            reply.send({})
        }
    )

    fastify.post<{ Params: { spaceId: string } }>(
        "/spaces/:spaceId/delete_orphans",
        { schema: { params: spaceParamsSchema } },
        async (request, reply) => {
            const { spaceId } = request.params
            await app.services.file.deleteOrphanFiles(app.models, spaceId)

            const space = await app.models.spaces.findOne({
                where: { id: spaceId },
                select: { usedStorage: true }
            })
            if (space === null) {
                reply.code(500).send()
                return
            }
            reply.send({ usedStorage: space.usedStorage })
        }
    )
}

export default spacesRoutes
