import assert from "node:assert"
import cookie from "@fastify/cookie"

import { Sinkron } from "sinkron"
import { App } from "../app"

describe("Spaces", () => {
    let app: App
    let user
    // let user2
    let headers: { [key: string]: string }

    beforeEach(async () => {
        const sinkron = new Sinkron({ dbPath: ":memory: " })
        await sinkron.init()
        app = new App({ sinkron, dbPath: ":memory:" })
        await app.init()

        const res = await app.services.users.create(app.models, {
            name: "test",
            password: "password"
        })
        assert(res.isOk)
        user = res.value

        /*
        const res2 = await app.services.users.create(app.models, {
            name: "user2",
            password: "password"
        })
        assert(res2.isOk)
        user2 = res2.value
        */

        const tokenRes = await app.services.auth.issueAuthToken(app.models, {
            userId: user.id
        })
        assert(tokenRes.isOk)
        headers = { Cookie: cookie.serialize("token", tokenRes.value.token) }
    })

    it("create, delete", async () => {
        const res = await app.fastify.inject({
            method: "POST",
            url: "/spaces/new",
            headers,
            payload: { name: "test" }
        })
        assert.strictEqual(res.statusCode, 200, "create")
        const space = JSON.parse(res.payload)

        const res2 = await app.fastify.inject({
            method: "GET",
            url: `/spaces/${space.id}/members`,
            headers
        })
        assert.strictEqual(res2.statusCode, 200, "get members")
        const members = JSON.parse(res2.payload)
        assert(Array.isArray(members) && members.length === 1)
        const memberId = members[0].id

        const res3 = await app.fastify.inject({
            method: "GET",
            url: `/spaces/${space.id}/members/${memberId}/remove`,
            headers
        })
        assert(res3.statusCode !== 200, "can't delete owner")

        const res4 = await app.fastify.inject({
            method: "POST",
            url: `/spaces/${space.id}/delete`,
            headers
        })
        assert.strictEqual(res4.statusCode, 200, "delete space")
    })
})
