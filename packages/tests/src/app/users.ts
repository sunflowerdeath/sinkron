import assert from "node:assert"

import { App } from "../app"

import { fakeMail } from "./utils"

describe("Users", () => {
    let app = new App()

    before(async () => {
        await app.init()
    })

    after(async () => {
        await app.destroy()
    })

    it("login", async () => {
        const res = await app.fastify.inject({
            url: "/login",
            method: "POST",
            payload: { email: fakeMail() }
        })
        assert.strictEqual(res.statusCode, 200, "login ok")
        const { id } = JSON.parse(res.payload)

        const code = app.services.auth.lastCode
        const res2 = await app.fastify.inject({
            method: "POST",
            url: "/code",
            payload: { id, code: code.split("").reverse().join("") }
        })
        assert.strictEqual(res2.statusCode, 500, "incorrect code")

        const res3 = await app.fastify.inject({
            method: "POST",
            url: "/code",
            payload: { id, code }
        })
        assert.strictEqual(res3.statusCode, 200, "correct code")
        const { token, user } = JSON.parse(res3.payload)
        assert(token !== undefined, "set auth token")
        const headers = { "x-sinkron-auth-token": token }

        const res4 = await app.fastify.inject({
            method: "GET",
            url: "/profile",
            headers
        })
        assert.strictEqual(res4.statusCode, 200, "profile is 200")
        const profile = JSON.parse(res4.payload)
        assert.strictEqual(profile.id, user.id, "user id")

        const res5 = await app.services.users.delete(app.models, user.id)
        assert(res5.isOk, "user deleted")

        const res6 = await app.fastify.inject({
            method: "GET",
            url: "/profile",
            headers
        })
        assert.strictEqual(res6.statusCode, 401, "profile is 401")
    })

    const login = async (email: string) => {
        const res = await app.fastify.inject({
            method: "POST",
            url: "/login",
            payload: { email }
        })
        const { id } = JSON.parse(res.payload)
        const res2 = await app.fastify.inject({
            method: "POST",
            url: "/code",
            payload: { id, code: app.services.auth.lastCode }
        })
        const { token } = JSON.parse(res2.payload)
        const headers = { "x-sinkron-auth-token": token }
        return { headers }
    }

    it("logout", async () => {
        const session = await login(fakeMail())

        const res = await app.fastify.inject({
            method: "POST",
            url: "/logout",
            headers: session.headers
        })
        assert.strictEqual(res.statusCode, 200, "logout ok")

        const res2 = await app.fastify.inject({
            method: "GET",
            url: "/profile",
            headers: session.headers
        })
        assert.strictEqual(res2.statusCode, 401, "401")
    })

    it("sessions", async () => {
        const email = fakeMail()
        await login(email)
        const session2 = await login(email)

        const res = await app.fastify.inject({
            method: "GET",
            url: "/account/sessions",
            headers: session2.headers
        })
        assert.strictEqual(res.statusCode, 200, "get sessions")
        const sessions = JSON.parse(res.payload)
        assert(Array.isArray(sessions) && sessions.length === 2, "2 sessions")

        const res2 = await app.fastify.inject({
            method: "POST",
            url: "/account/sessions/terminate",
            headers: session2.headers
        })
        assert.strictEqual(res2.statusCode, 200, "terminate")
        const terminated = JSON.parse(res2.payload)
        assert(
            Array.isArray(terminated) && terminated.length === 1,
            "1 session"
        )
    })
})
