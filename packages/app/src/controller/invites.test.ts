import assert from "node:assert"

import { Sinkron } from "sinkron"
import { App } from "../app"

describe("InvitesController", () => {
    let app
    let ownerId = ""
    let memberId = ""
    let invitedId = ""
    let spaceId = ""

    beforeEach(async () => {
        const sinkron = new Sinkron({ dbPath: ":memory: " })
        await sinkron.init()
        app = new App({ sinkron, dbPath: ":memory:" })
        await app.init()

        const c = app.controller

        const ownerRes = await c.users.createUser("owner", "password")
        if (ownerRes.isOk) ownerId = ownerRes.value.id

        const memberRes = await c.users.createUser("member", "password")
        if (ownerRes.isOk) ownerId = ownerRes.value.id

        const invitedRes = await c.users.createUser("invited", "password")
        if (invitedRes.isOk) invitedId = invitedRes.value.id

        const spaceRes = await c.spaces.create({ name: "space", ownerId })
        if (spaceRes.isOk) spaceId = spaceRes.value.id

        await c.spaces.addMember({
            spaceId,
            role: "readonly",
            userId: memberId
        })
    })

    it("send invite", async () => {
        const c = app!.controller

        // invalid fromId
        const res1 = await c.invites.create({
            fromId: "invalid",
            toId: invitedId,
            spaceId: spaceId,
            role: "readonly"
        })
        assert(!res1.isOk, "invalid fromId")

        // invalid toId
        const res2 = await c.invites.create({
            fromId: ownerId,
            toId: "invalid",
            spaceId: spaceId,
            role: "readonly"
        })
        assert(!res2.isOk, "invalid toId")

        // invalid spaceId
        const res3 = await c.invites.create({
            fromId: ownerId,
            toId: invitedId,
            spaceId: "invalid",
            role: "readonly"
        })
        assert(!res3.isOk, "invalid spaceId")

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
