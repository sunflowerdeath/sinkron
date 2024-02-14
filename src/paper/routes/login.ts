import Router from 'koa-tree-router'

import { Controller } from "../controller"

const loginRouter = (controller: Controller) => {
    const router = new Router()

    router.post('/login', async (ctx) => {
        ctx.type = 'application/json'
        const { name, password } = ctx.request.body
        const res = await controller.users.authorizeWithPassword(
            name,
            password
        )
        if (res.isOk) {
            const token = res.value
            ctx.cookies.set('token', token.token, { httpOnly: false })
            const profileRes = await controller.users.getUserProfile(
                token.userId
            )
            if (!profileRes.isOk) throw 'hz'
            ctx.body = profileRes.value
        } else {
            ctx.cookies.set('token')
            ctx.status = 500
            ctx.body = { error: { message: 'Invalid name or password' } }
        }
    })

    return router
}
    
export default loginRouter
