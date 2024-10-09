import { FastifyInstance } from "fastify"
import { Or, Equal } from "typeorm"

import {App} from "../app"

type InviteCreateBody = {
    spaceId: string
    toEmail: string
    role: "readonly" | "editor" | "admin"
}

const inviteCreateBodySchema = {
    type: "object",
    properties: {
        spaceId: { type: "string", minLength: 1 },
        toEmail: { type: "string", minLength: 1 },
        role: { type: "string", minLength: 1 } // TODO one of
    },
    required: ["spaceId", "toEmail", "role"],
    additionalProperties: false
}

const inviteParamsSchema = {
    type: "object",
    properties: {
        id: { type: "string", format: "uuid" }
    },
    required: ["id"],
    additionalProperties: false
}

type InviteUpdateBody = { role: "readonly" | "editor" | "admin" }

const inviteUpdateBodySchema = {
    type: "object",
    properties: {
        role: { type: "string", minLength: 1 } // TODO one of
    },
    required: ["role"],
    additionalProperties: false
}

const invitesRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.post<{ Body: InviteCreateBody }>(
        "/invites/new",
        { schema: { body: inviteCreateBodySchema } },
        async (request, reply) => {
            const { spaceId, toEmail, role } = request.body
            const res = await app.services.invites.create(app.models, {
                fromId: request.token.userId,
                spaceId,
                toEmail,
                role
            })
            if (!res.isOk) {
                reply.code(500).send({ error: res.error })
                return
            }
            await app.services.users.setUnreadNotifications(
                app.models,
                res.value.toId
            )
            reply.send(res.value)
        }
    )

    fastify.post<{ Params: { id: string }; Body: InviteUpdateBody }>(
        "/invites/:id/update",
        {
            schema: { body: inviteUpdateBodySchema, params: inviteParamsSchema }
        },
        async (request, reply) => {
            const { role } = request.body
            const { id } = request.params
            const userId = request.token.userId

            const invite = await app.models.invites.findOne({
                where: { id, status: "sent" },
                select: { spaceId: true }
            })
            if (invite === null) {
                reply.code(500).send({ error: { message: "Invite not found" } })
                return
            }

            const currentUserRole = await app.services.spaces.getMemberRole(
                app.models,
                { userId, spaceId: invite.spaceId }
            )
            const isPermitted =
                currentUserRole !== null &&
                (role === "admin"
                    ? currentUserRole === "owner"
                    : ["admin", "owner"].includes(currentUserRole))
            if (!isPermitted) {
                reply.code(500).send({ error: { message: "Not permitted" } })
                return
            }

            await app.models.invites.update({ id }, { role })

            const inviteRes = await app.services.invites.get(app.models, id)
            if (!inviteRes.isOk) {
                reply.code(500).send()
                return
            }
            reply.send(inviteRes.value)
        }
    )

    fastify.post<{ Params: { id: string } }>(
        "/invites/:id/accept",
        { schema: { params: inviteParamsSchema } },
        async (request, reply) => {
            const id = request.params.id
            const userId = request.token.userId

            const updateRes = await app.models.invites.update(
                { id, status: "sent", toId: userId },
                { status: "accepted" }
            )
            if (updateRes.affected === 0) {
                reply.code(500).send({ error: { message: "Invite not found" } })
                return
            }

            const inviteRes = await app.services.invites.get(app.models, id)
            if (!inviteRes.isOk) {
                reply.code(500).send()
                return
            }
            const invite = inviteRes.value

            await app.services.spaces.addMember(app.models, {
                userId: invite.to.id,
                spaceId: invite.space.id,
                role: invite.role
            })

            const getSpaceRes = await app.services.spaces.getUserSpace(
                app.models,
                userId,
                invite.space.id
            )
            if (!getSpaceRes.isOk) {
                reply.code(500).send(getSpaceRes.error)
                return
            }

            const acceptedInvite = { ...invite, space: getSpaceRes.value }
            reply.send(acceptedInvite)
        }
    )

    fastify.post<{ Params: { id: string } }>(
        "/invites/:id/decline",
        { schema: { params: inviteParamsSchema } },
        async (request, reply) => {
            const id = request.params.id
            const updateRes = await app.models.invites.update(
                { id, status: "sent", toId: request.token.userId },
                { status: "declined" }
            )
            if (updateRes.affected === 0) {
                reply.code(500).send({ error: { message: "Invite not found" } })
                return
            }

            const inviteRes = await app.services.invites.get(app.models, id)
            if (!inviteRes.isOk) {
                reply.code(500).send()
                return
            }
            reply.send(inviteRes.value)
        }
    )

    fastify.post<{ Params: { id: string } }>(
        "/invites/:id/cancel",
        { schema: { params: inviteParamsSchema } },
        async (request, reply) => {
            const id = request.params.id
            const invite = await app.models.invites.findOne({
                where: { id, status: "sent" },
                select: { spaceId: true }
            })
            if (invite === null) {
                reply.code(500).send({ error: { message: "Invite not found" } })
                return
            }

            const role = await app.services.spaces.getMemberRole(app.models, {
                userId: request.token.userId,
                spaceId: invite.spaceId
            })
            if (role === null || !["admin", "owner"].includes(role)) {
                reply.code(500).send({ error: { message: "Not permitted" } })
                return
            }

            await app.models.invites.update({ id }, { status: "cancelled" })

            const inviteRes = await app.services.invites.get(app.models, id)
            if (!inviteRes.isOk) {
                reply.code(500).send()
                return
            }
            reply.send(inviteRes.value)
        }
    )

    fastify.post<{ Params: { id: string } }>(
        "/invites/:id/hide",
        { schema: { params: inviteParamsSchema } },
        async (request, reply) => {
            const id = request.params.id
            const updateRes = await app.models.invites.update(
                {
                    id,
                    status: Or(Equal("accepted"), Equal("declined")),
                    fromId: request.token.userId
                },
                { isHidden: true }
            )
            if (updateRes.affected === 0) {
                reply.code(500).send({ error: { message: "Invite not found" } })
                return
            }

            const inviteRes = await app.services.invites.get(app.models, id)
            if (!inviteRes.isOk) {
                reply.code(500).send()
                return
            }
            reply.send(inviteRes.value)
        }
    )
}

export default invitesRoutes

