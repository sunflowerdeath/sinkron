import assert from "node:assert"

import { App } from "../app"

import { fakeMail } from "./utils"

const createUser = async (app: App, email: string) => {
    const res = await app.services.users.create(app.models, email)
    assert(res.isOk)
    const res2 = await app.services.users.getProfile(app.models, res.value.id)
    assert(res2.isOk)
    return res2.value
}

const getAuthHeaders = async (app: App, userId: string) => {
    const res = await app.services.auth.issueAuthToken(app.models, { userId })
    assert(res.isOk)
    return { 'x-sinkron-auth-token': res.value.token }
}

describe("Invites", () => {
    const app = new App()

    before(async () => {
        await app.init()
    })

    after(async () => {
        await app.destroy()
    })

    it("send invite", async () => {
        const ownerEmail = fakeMail()
        const owner = await createUser(app, ownerEmail)
        const ownerHeaders = await getAuthHeaders(app, owner.id)

        const userEmail = fakeMail()
        const user = await createUser(app, userEmail)
        const userHeaders = await getAuthHeaders(app, user.id)

        const spaceId = owner.spaces[0].id

        const res1 = await app.fastify.inject({
            method: "POST",
            url: "/invites/new",
            headers: ownerHeaders,
            payload: { toEmail: "ERROR", spaceId, role: "readonly" }
        })
        assert(res1.statusCode !== 200, "user not found")

        const res2 = await app.fastify.inject({
            method: "POST",
            url: "/invites/new",
            headers: ownerHeaders,
            payload: { toEmail: ownerEmail, spaceId, role: "readonly" }
        })
        assert(res2.statusCode !== 200, "already member")

        const res3 = await app.fastify.inject({
            method: "POST",
            url: "/invites/new",
            headers: ownerHeaders,
            payload: { toEmail: userEmail, spaceId, role: "editor" }
        })
        assert.strictEqual(res3.statusCode, 200, "send invite")
        const invite = JSON.parse(res3.payload)

        const res4 = await app.fastify.inject({
            method: "GET",
            url: "/notifications",
            headers: userHeaders
        })
        assert.strictEqual(res4.statusCode, 200, "notifications")
        const notifications = JSON.parse(res4.payload)
        assert(
            Array.isArray(notifications.invites) &&
                notifications.invites.length === 1,
            "notifications"
        )
        assert.strictEqual(
            notifications.invites[0].id,
            invite.id,
            "notification"
        )
    })

    it("cancel", async () => {
        const ownerEmail = fakeMail()
        const owner = await createUser(app, ownerEmail)
        const ownerHeaders = await getAuthHeaders(app, owner.id)

        const userEmail = fakeMail()
        await createUser(app, userEmail)

        const spaceId = owner.spaces[0].id

        const res = await app.fastify.inject({
            method: "POST",
            url: "/invites/new",
            headers: ownerHeaders,
            payload: { toEmail: userEmail, spaceId, role: "editor" }
        })
        assert.strictEqual(res.statusCode, 200, "send invite")
        const invite = JSON.parse(res.payload)

        const res2 = await app.fastify.inject({
            method: "POST",
            url: `/invites/${invite.id}/cancel`,
            headers: ownerHeaders
        })
        assert.strictEqual(res2.statusCode, 200, "cancel")
        const cancelledInvite = JSON.parse(res2.payload)
        assert.strictEqual(cancelledInvite.status, "cancelled", "cancelled")
    })

    it("decline", async () => {
        const ownerEmail = fakeMail()
        const owner = await createUser(app, ownerEmail)
        const ownerHeaders = await getAuthHeaders(app, owner.id)

        const userEmail = fakeMail()
        const user = await createUser(app, userEmail)
        const userHeaders = await getAuthHeaders(app, user.id)

        const spaceId = owner.spaces[0].id

        const res = await app.fastify.inject({
            method: "POST",
            url: "/invites/new",
            headers: ownerHeaders,
            payload: { toEmail: userEmail, spaceId, role: "editor" }
        })
        assert.strictEqual(res.statusCode, 200, "send invite")
        const invite = JSON.parse(res.payload)

        const res2 = await app.fastify.inject({
            method: "POST",
            url: `/invites/${invite.id}/decline`,
            headers: userHeaders
        })
        assert.strictEqual(res2.statusCode, 200, "decline")
        const declinedInvite = JSON.parse(res2.payload)
        assert.strictEqual(declinedInvite.status, "declined", "declined")
    })

    it("accept", async () => {
        const ownerEmail = fakeMail()
        const owner = await createUser(app, ownerEmail)
        const ownerHeaders = await getAuthHeaders(app, owner.id)

        const userEmail = fakeMail()
        const user = await createUser(app, userEmail)
        const userHeaders = await getAuthHeaders(app, user.id)

        const spaceId = owner.spaces[0].id

        const res = await app.fastify.inject({
            method: "POST",
            url: "/invites/new",
            headers: ownerHeaders,
            payload: { toEmail: userEmail, spaceId, role: "editor" }
        })
        assert.strictEqual(res.statusCode, 200, "send invite")
        const invite = JSON.parse(res.payload)

        const res2 = await app.fastify.inject({
            method: "POST",
            url: `/invites/${invite.id}/accept`,
            headers: userHeaders
        })
        assert.strictEqual(res2.statusCode, 200, "accept")
        const declinedInvite = JSON.parse(res2.payload)
        assert.strictEqual(declinedInvite.status, "accepted", "accepted")
    })
})
