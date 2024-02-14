import Router from '@koa/router'

import { Controller } from "../controller"

const spacesRouter = (controller: Controller) => {
    const router = new Router()

    // create space
    router.post('/spaces/new', (ctx) => {
        const { name } = ctx.request.body
        controller.spaces.create({
            name,
            ownerId: ctx.token.userId
        })
    })

    // get list of members
    router.get('/spaces/:id/members', () => {
        // TODO
    })

    // update member of a space (change role)
    router.post('/spaces/:idd/members/:member/update', () => {
        // TODO
    })

    // remove member from a space
    router.post('/spaces/:idd/members/:member/remove', () => {
        // TODO
    })

    return router
}

export default spacesRouter

