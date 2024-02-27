import Router from '@koa/router'

import { Controller } from "../controller"

const invitesRouter = (controller: Controller) => {
    const router = new Router()

    // send invite to a user
    router.post('/invites/new', () => {
        // TODO
    })

    // accept invite
    router.post('/invites/:id/accept', () => {
        // TODO
    })

    // reject invite
    router.post('/invites/:id/reject', () => {
        // TODO
    })

    // cancel invite
    router.post('/invites/:id/cancel', () => {
        // TODO
    })

    return router
}

export default invitesRouter
