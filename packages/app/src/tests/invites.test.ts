import assert from "node:assert"
import cookie from "@fastify/cookie"

import { Sinkron } from "sinkron"
import { App } from "../app"
import { User } from "../entities"

const createUser = async (app: App, name: string) => {
    const res = await app.services.users.create(app.models, {
        name,
        password: "password"
    })
    assert(res.isOk)
    const res2 = await app.services.users.getProfile(app.models, res.value.id)
    assert(res2.isOk)
    return res2.value
}

const getAuthHeaders = async (app: App, id: string) => {
    const res = await app.services.auth.issueAuthToken(app.models, {
        userId: id
    })
    assert(res.isOk)
    return { Cookie: cookie.serialize("token", res.value.token) }
}

describe("Invites", () => {
    let app: App
    let owner: User
    let user: User

    beforeEach(async () => {
        const sinkron = new Sinkron({ dbPath: ":memory: " })
        await sinkron.init()
        app = new App({ sinkron, dbPath: ":memory:" })
        await app.init()

        owner = await createUser(app, "owner")
        user = await createUser(app, "user")
    })

    it.only("send invite", async () => {
        const ownerHeaders = await getAuthHeaders(app, owner.id)
        // const userHeaders = await getAuthHeaders(app, user.id)

        const spaceId = owner.spaces[0].id

        // User not found
        const res1 = await app.fastify.inject({
            method: "POST",
            url: "/invites/new",
            headers: ownerHeaders,
            payload: {
                toName: "not found",
                spaceId,
                role: "readonly"
            }
        })
        assert(res1.statusCode !== 200, "user not found")

        // Already a member
        const res2 = await app.fastify.inject({
            method: "POST",
            url: "/invites/new",
            headers: ownerHeaders,
            payload: {
                toName: "owner",
                spaceId,
                role: "readonly"
            }
        })
        assert(res2.statusCode !== 200, "already member")

        const res3 = await app.fastify.inject({
            method: "POST",
            url: "/invites/new",
            headers: ownerHeaders,
            payload: {
                toName: "user",
                spaceId,
                role: "editor"
            }
        })
        assert.strictEqual(res3.statusCode, 200, "send invite")
    })

    /*
    it("cancel", async () => {
        const c = app!.controller

        const res = await c.invites.create({
            fromId: ownerId,
            toId: invitedId,
            spaceId: spaceId,
            role: "readonly"
        })
        assert(res.isOk)
        const invite = res.value

        const res2 = await c.invites.cancel(invite.id)
        assert(res2.isOk)
        assert(res2.value.status === "cancelled")
    })

    it("decline", async () => {
        const c = app!.controller

        const res = await c.invites.create({
            fromId: ownerId,
            toId: invitedId,
            spaceId: spaceId,
            role: "readonly"
        })
        assert(res.isOk)
        const invite = res.value

        const res2 = await c.invites.decline(invite.id)
        assert(res2.isOk)
        assert(res2.value.status === "declined")
    })

    it("accept", async () => {
        const c = app!.controller

        const res = await c.invites.create({
            fromId: ownerId,
            toId: invitedId,
            spaceId: spaceId,
            role: "readonly"
        })
        assert(res.isOk)
        const invite = res.value

        const res2 = await c.invites.accept(invite.id)
        assert(res2.isOk)
        const accepted = res2.value
        assert(accepted.status === "accepted")

        const res3 = await c.spaces.getMembers(spaceId)
        assert(res3.isOk)
        const user = res3.value.find((u) => u.id === invitedId)
        assert(user !== undefined)
    })
    */
})
