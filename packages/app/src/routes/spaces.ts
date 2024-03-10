import Router from "@koa/router"

import { Controller } from "../controller"

const spacesRouter = (controller: Controller) => {
    const router = new Router()

    router.post("/spaces/new", async (ctx) => {
        const { name } = ctx.request.body

        const res = await controller.spaces.create({
            name,
            ownerId: ctx.token.userId
        })
        if (!res.isOk) {
            ctx.status = 500
            ctx.body = res.error
            return
        }

        ctx.body = res.value
    })

    router.post("/spaces/:id/delete", async (ctx) => {
        const id = ctx.params.id

        const space = await controller.spaces.spaces.findOne({
            where: { id },
            select: { ownerId: true }
        })
        if (space === null || space.ownerId !== ctx.token.userId) {
            ctx.status = 500
            return
        }

        await controller.spaces.delete(id)
        ctx.body = {}
    })


    router.get("/spaces/:id/members", async (ctx) => {
        const { id } = ctx.params

        const exist = await controller.spaces.exists(id)
        if (!exist) {
            ctx.status = 500
            return
        }

        const count = await controller.spaces.members.count({
            where: { userId: ctx.token.userId, spaceId: id },
        })
        if (count === 0) {
            ctx.status = 500
            return
        }

        const members = await controller.spaces.getMembers(ctx.params.id)
        ctx.body = members
    })

    router.post("/spaces/:id/members/:member/update", () => {
        // update member of a space (change role)
        // TODO
    })

    router.post("/spaces/:id/members/:member/remove", async (ctx) => {
        const spaceId = ctx.params.id
        const memberId = ctx.params.member

        const member = await controller.spaces.members.findOne({
            where: { id: memberId, spaceId },
            select: { userId: true, role: true }
        })
        if (member === null) {
            ctx.status = 500
            return
        }

        const currentUserMember = await controller.spaces.members.findOne({
            where: { userId: ctx.token.userId, spaceId },
            select: { role: true }
        })
        const isPermitted =
            currentUserMember !== null &&
            member.role !== "owner" &&
            (member.role === "admin"
                ? currentUserMember.role === "owner"
                : ["admin", "owner"].includes(currentUserMember.role))
        if (!isPermitted) {
            ctx.status = 500
            return
        }

        await controller.spaces.members.delete({ id: memberId })
        ctx.body = {}
    })

    return router
}

export default spacesRouter
