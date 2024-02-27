import Router from "koa-tree-router"

import { Controller } from "../controller"

const loginRouter = (controller: Controller) => {
    const router = new Router()

    router.post("/login", async (ctx) => {
        ctx.type = "application/json"
        const { name, password } = ctx.request.body
        const res = await controller.users.authorizeWithPassword(name, password)
        if (res.isOk) {
            const token = res.value
            ctx.cookies.set("token", token.token, { httpOnly: false })
            const profileRes = await controller.users.getUserProfile(
                token.userId
            )
            if (!profileRes.isOk) {
                ctx.status = 500
                ctx.body = { error: { message: "Couldn't authorize" } }
                return
            }
            ctx.body = profileRes.value
        } else {
            ctx.cookies.set("token")
            ctx.status = 500
            ctx.body = { error: { message: res.error.message } }
        }
    })

    router.post("/signup", async (ctx) => {
        ctx.type = "application/json"
        const { name, password } = ctx.request.body

        const createRes = await controller.users.createUser(name, password)
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

        ctx.cookies.set("token", token.token, { httpOnly: false })
        const getProfileRes = await controller.users.getUserProfile(userId)
        if (!getProfileRes.isOk) return getProfileRes
        ctx.body = getProfileRes.value
    })

    return router
}

export default loginRouter
