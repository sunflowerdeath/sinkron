import Router from "@koa/router"

import { Controller } from "../controller"

const invitesRouter = (controller: Controller) => {
    const router = new Router()

    router.post("/invites/new", async (ctx) => {
        const { spaceId, toId, role } = ctx.request.body

        const res = await controller.invites.create({
            fromId: ctx.token.userId,
            spaceId,
            toId,
            role
        })
        if (!res.isOk) {
            ctx.status = 500
            ctx.body = res.error
            return
        }
        ctx.body = res.value
    })

    router.post("/invites/:id/update", async (ctx) => {
        const { role } = ctx.request.body
        const { id } = ctx.params

        const invite = await controller.invites.invites.findOne({
            where: { id, status: "sent" },
            select: { spaceId: true }
        })
        if (invite === null) {
            ctx.status = 500
            ctx.body = { error: { message: "Invite not found" } }
            return
        }

        const member = await controller.invites.members.findOne({
            where: { spaceId: invite.spaceId, userId: ctx.token.userId },
            select: { role: true }
        })
        const isPermitted =
            member !== null &&
            (role === "admin"
                ? member.role === "owner"
                : ["admin", "owner"].includes(member.role))
        if (!isPermitted) {
            ctx.status = 500
            ctx.body = { error: { message: "Not permitted" } }
            return
        }

        await controller.invites.invites.update({ id }, { role })

        const inviteRes = await controller.invites.get(id)
        if (!inviteRes.isOk) {
            ctx.status = 500
            return
        }
        ctx.body = inviteRes.value
    })

    router.post("/invites/:id/accept", async (ctx) => {
        const id = ctx.params.id

        const updateRes = await controller.invites.invites.update(
            { id, status: "sent", toId: ctx.token.userId },
            { status: "accepted" }
        )
        if (updateRes.affected === 0) {
            ctx.status = 500
            ctx.body = { error: { message: "Invite not found" } }
            return
        }

        const inviteRes = await controller.invites.get(id)
        if (!inviteRes.isOk) {
            ctx.status = 500
            return
        }
        const invite = inviteRes.value

        await controller.spaces.addMember({
            userId: invite.to.id,
            spaceId: invite.space.id,
            role: invite.role
        })

        ctx.body = invite
    })

    router.post("/invites/:id/decline", async (ctx) => {
        const id = ctx.params.id

        const updateRes = await controller.invites.invites.update(
            { id, status: "sent", toId: ctx.token.userId },
            { status: "declined" }
        )
        if (updateRes.affected === 0) {
            ctx.status = 500
            ctx.body = { error: { message: "Invite not found" } }
            return
        }

        const inviteRes = await controller.invites.get(id)
        if (!inviteRes.isOk) {
            ctx.status = 500
            return
        }
        ctx.body = inviteRes.value
    })

    router.post("/invites/:id/cancel", async (ctx) => {
        const id = ctx.params.id

        const invite = await controller.invites.invites.findOne({
            where: { id, status: "sent" },
            select: { spaceId: true }
        })
        if (invite === null) {
            ctx.status = 500
            ctx.body = { error: { message: "Invite not found" } }
            return
        }

        const member = await controller.invites.members.findOne({
            where: { spaceId: invite.spaceId, userId: ctx.token.userId },
            select: { role: true }
        })
        if (member === null || !["admin", "owner"].includes(member.role)) {
            ctx.status = 500
            ctx.body = { error: { message: "Not permitted" } }
            return
        }

        await controller.invites.invites.update({ id }, { status: "cancelled" })

        const inviteRes = await controller.invites.get(id)
        if (!inviteRes.isOk) {
            ctx.status = 500
            return
        }
        ctx.body = inviteRes.value
    })

    router.post("/invites/:id/hide", async (ctx) => {
        // TODO
    })

    return router
}

export default invitesRouter
