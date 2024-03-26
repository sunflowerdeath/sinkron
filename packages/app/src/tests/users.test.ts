import assert from "node:assert"
import cookie from "@fastify/cookie"

import { App } from "../app"

describe("Users", () => {
    let app: App
    beforeEach(async () => {
        app = new App({})
        await app.init()
    })

    it("signup", async () => {
        const res = await app.fastify.inject({
            url: "/signup",
            method: "POST",
            payload: {
                name: "test",
                password: "password"
            }
        })
        assert.strictEqual(res.statusCode, 200, "signup is 200")
        const tokenCookie = res.cookies.find((c) => c.name === "token")!
        assert(tokenCookie !== undefined, "set token cookie")
        const token = tokenCookie.value
        const user = JSON.parse(res.payload)
        const headers = { Cookie: cookie.serialize("token", token) }

        const res2 = await app.fastify.inject({
            method: "GET",
            url: "/profile",
            headers
        })
        assert.strictEqual(res2.statusCode, 200, "profile is 200")
        const profile = JSON.parse(res2.payload)
        assert.strictEqual(profile.id, user.id, "user id")

        const res3 = await app.services.users.delete(app.models, user.id)
        assert(res3.isOk, "user deleted")

        const res4 = await app.fastify.inject({
            method: "GET",
            url: "/profile",
            headers
        })
        assert.strictEqual(res4.statusCode, 401, "profile is 401")
    })

    it("login", async () => {
        const res = await app.services.users.create(app.models, {
            name: "test",
            password: "password"
        })
        assert(res.isOk, "user created")

        const res2 = await app.fastify.inject({
            method: "POST",
            url: "/login",
            payload: { name: "ERROR", password: "password" }
        })
        assert(res2.statusCode !== 200, "invalid username")

        const res3 = await app.fastify.inject({
            method: "POST",
            url: "/login",
            payload: { name: "test", password: "ERROR" }
        })
        assert(res3.statusCode !== 200, "invalid password")

        const res4 = await app.fastify.inject({
            method: "POST",
            url: "/login",
            payload: { name: "test", password: "password" }
        })
        assert.strictEqual(res4.statusCode, 200, "authorized")
        const tokenCookie = res4.cookies.find((c) => c.name === "token")!
        assert(tokenCookie !== undefined, "set token cookie")
        const token = tokenCookie.value
        const headers = { Cookie: cookie.serialize("token", token) }

        const res5 = await app.fastify.inject({
            method: "GET",
            url: "/profile",
            headers
        })
        assert.strictEqual(res5.statusCode, 200, "profile ok")

        const res6 = await app.fastify.inject({
            method: "POST",
            url: "/logout",
            headers
        })
        assert.strictEqual(res6.statusCode, 200, "logout ok")

        const res7 = await app.fastify.inject({
            method: "GET",
            url: "/profile",
            headers
        })
        assert.strictEqual(res7.statusCode, 401, "profile not ok")
    })

    it("sessions", async () => {
        const res = await app.services.users.create(app.models, {
            name: "test",
            password: "password"
        })
        assert(res.isOk, "user created")

        await app.fastify.inject({
            method: "POST",
            url: "/login",
            payload: { name: "test", password: "password" }
        })

        const res2 = await app.fastify.inject({
            method: "POST",
            url: "/login",
            payload: { name: "test", password: "password" }
        })
        const tokenCookie = res2.cookies.find((c) => c.name === "token")!
        assert(tokenCookie !== undefined, "set token cookie")
        const token = tokenCookie.value
        const headers = { Cookie: cookie.serialize("token", token) }

        const res3 = await app.fastify.inject({
            method: "GET",
            url: "/account/sessions",
            headers
        })
        assert.strictEqual(res3.statusCode, 200, "get sessions")
        const sessions = JSON.parse(res3.payload)
        assert(Array.isArray(sessions) && sessions.length === 2, "2 sessions")

        const res4 = await app.fastify.inject({
            method: "POST",
            url: "/account/sessions/terminate",
            headers
        })
        assert.strictEqual(res3.statusCode, 200, "terminate")
        const terminated = JSON.parse(res4.payload)
        assert(
            Array.isArray(terminated) && terminated.length === 1,
            "1 session"
        )
    })
})
