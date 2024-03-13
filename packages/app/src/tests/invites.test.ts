import assert from "node:assert"

import { Sinkron } from "sinkron"
import { App } from "../app"

describe("InvitesController", () => {
    let app: App
    let ownerId = ""
    let memberId = ""
    let invitedId = ""
    let spaceId = ""

    beforeEach(async () => {
        const sinkron = new Sinkron({ dbPath: ":memory: " })
        await sinkron.init()
        app = new App({ sinkron, dbPath: ":memory:" })
        await app.init()

        const ownerRes = await app.services.users.createUser(app.models, {
            name: "owner",
            password: "password"
        })
        if (ownerRes.isOk) ownerId = ownerRes.value.id

        const memberRes = await app.services.users.createUser(app.models, {
            name: "member",
            password: "password"
        })
        if (memberRes.isOk) memberId = memberRes.value.id

        const invitedRes = await app.services.users.createUser(app.models, {
            name: "invited",
            password: "password"
        })
        if (invitedRes.isOk) invitedId = invitedRes.value.id

        const spaceRes = await app.services.spaces.create(app.models, {
            name: "space",
            ownerId
        })
        if (spaceRes.isOk) spaceId = spaceRes.value.id

        await app.services.spaces.addMember(app.models, {
            spaceId,
            role: "readonly",
            userId: memberId
        })
    })

    it("send invite", async () => {
        // invalid fromId
        const res1 = await app.fastify.inject({
            url: "/invites/new",
            payload: {
                fromId: "invalid",
                toId: invitedId,
                spaceId: spaceId,
                role: "readonly"
            }
        })
        assert(res1.statusCode !== 200, "invalid fromId")

        // invalid toId
        const res2 = await app.fastify.inject({
            url: "/invites/new",
            payload: {
                fromId: ownerId,
                toId: "invalid",
                spaceId: spaceId,
                role: "readonly"
            }
        })
        assert(res2.statusCode !== 200, "invalid toId")

        // invalid spaceId
        const res3 = await app.fastify.inject({
            url: "/invites/new",
            payload: {
                fromId: ownerId,
                toId: invitedId,
                spaceId: "invalid",
                role: "readonly"
            }
        })
        assert(res3.statusCode !== 200, "invalid spaceId")

        // invalid role
        const res4 = await c.invites.create({
            fromId: memberId,
            toId: invitedId,
            spaceId: spaceId,
            role: "readonly"
        })
        assert(!res4.isOk, "invalid role")

        // valid
        const res5 = await c.invites.create({
            fromId: ownerId,
            toId: invitedId,
            spaceId: spaceId,
            role: "readonly"
        })
        assert(res5.isOk, "valid")
    })

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
})
