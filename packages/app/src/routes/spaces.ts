import Router from '@koa/router'

import { Controller } from "../controller"

const spacesRouter = (controller: Controller) => {
    const router = new Router()

    router.post('/spaces/new', async (ctx) => {
        const { name } = ctx.request.body
        const res = await controller.spaces.create({
            name,
            ownerId: ctx.token.userId
        })
        if (res.isOk) {
            ctx.body = res.value
        } else {
            ctx.status = 500
            ctx.body = res.error
        }
    })

    router.get('/spaces/:id/members', async (ctx) => {
        const res = await controller.spaces.getMembers(ctx.params.id)
        if (res.isOk) {
            ctx.body = res.value
        } else {
            ctx.status = 500
            ctx.body = res.error
        }
    })

    // update member of a space (change role)
    router.post('/spaces/:id/members/:member/update', () => {
        // TODO
    })

    // remove member from a space
    router.post('/spaces/:id/members/:member/remove', () => {
        // TODO
    })

    return router
}

export default spacesRouter

