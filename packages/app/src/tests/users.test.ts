import assert from "node:assert"
import cookie from "@fastify/cookie"

import { Sinkron } from "sinkron"
import { App } from "../app"

describe("Users", () => {
    let app: App
    beforeEach(async () => {
        const sinkron = new Sinkron({ dbPath: ":memory: " })
        await sinkron.init()
        app = new App({ sinkron, dbPath: ":memory:" })
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
})
