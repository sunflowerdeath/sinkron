import Router from "koa-tree-router"

import { Controller } from "../controller"

const timeout = (timeout: number) =>
    new Promise((resolve) => setTimeout(resolve, timeout))

const loginRouter = (controller: Controller) => {
    const router = new Router()

    router.post("/login", async (ctx) => {
        const { name, password } = ctx.request.body

        await timeout(1500)

        const authRes = await controller.users.authorizeWithPassword({
            name,
            password
        })
        if (!authRes.isOk) {
            ctx.cookies.set("token")
            ctx.status = 500
            ctx.body = { error: authRes.error }
            return
        }

        const token = authRes.value
        const profileRes = await controller.users.getProfile(token.userId)
        if (!profileRes.isOk) {
            ctx.status = 500
            ctx.body = { error: { message: "Couldn't authorize" } }
            return
        }
        ctx.cookies.set("token", token.token, { httpOnly: false })
        ctx.body = profileRes.value
    })

    router.post("/signup", async (ctx) => {
        const { name, password } = ctx.request.body

        await timeout(1500)

        const createRes = await controller.users.createUser({ name, password })
        if (!createRes.isOk) {
            ctx.status = 500
            ctx.body = { error: { message: createRes.error.message } }
            return
        }
        const userId = createRes.value.id

        const issueTokenRes = await controller.users.issueAuthToken({ userId })
        if (!issueTokenRes.isOk) {
            ctx.status = 500
            ctx.body = { error: { message: "Unknown error" } }
            return
        }
        const token = issueTokenRes.value

        const getProfileRes = await controller.users.getProfile(userId)
        if (!getProfileRes.isOk) return getProfileRes

        ctx.cookies.set("token", token.token, { httpOnly: false })
        ctx.body = getProfileRes.value
    })

    return router
}

export default loginRouter
