import assert from "node:assert"

import { Sinkron } from "sinkron"
import { App } from "../app"

describe("UsersController", () => {
    let app
    beforeEach(async () => {
        const sinkron = new Sinkron({ dbPath: ":memory: " })
        await sinkron.init()
        app = new App({ sinkron, dbPath: ":memory:" })
        await app.init()
    })

    it("create delete users", async () => {
        const c = app!.controller

        const res = await c.users.createUser({
            name: "test",
            password: "password"
        })
        assert(res.isOk)
        const user = res.value

        const ctx = { token: { userId: user.id } }

        const res2 = await c.users.getUserProfile(ctx)
        assert(res2.isOk)

        const res3 = await c.users._deleteUser(user.id)
        assert(res3.isOk)

        const res4 = await c.users.getUserProfile(ctx)
        assert(!res4.isOk)
    })

    it("authorization", async () => {
        const c = app!.controller

        const res = await c.users._createUser({
            name: "test",
            password: "password"
        })
        assert(res.isOk)
        const user = res.value

        const res2 = await c.users.authorize("ERROR", "password")
        assert(!res2.isOk, "invalid username")

        const res3 = await c.users.authorize("test", "ERROR")
        assert(!res3.isOk, "invalid password")

        const res4 = await c.users.authorize("test", "password")
        assert(res4.isOk, "authorized")
        const token = res4.value

        const res5 = await c.users._verifyAuthToken("ERROR")
        assert(res5.isOk && res5.value === null, "invalid token")

        const res6 = await c.users.verifyAuthToken(token.token)
        assert(res6.isOk && res6 !== null, "valid token")

        const res7 = await c.users._getUserTokens(user.id)
        assert(res7.isOk, "get active tokens")
        assert(res7.value.length === 1)

        const res8 = await c.users._deleteToken(token.token)
        assert(res8.isOk, "delete token")

        const res9 = await c.users._getUserTokens(user.id)
        assert(res9.isOk)
        assert(res9.value.length === 0)
    })
})
