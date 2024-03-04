import assert from "node:assert"

import { Sinkron } from "sinkron"
import { App } from "../app"

describe("InvitesController", () => {
    let app
    let user1Id = ""
    let user2Id = ""
    let spaceId = ""

    beforeEach(async () => {
        const sinkron = new Sinkron({ dbPath: ":memory: " })
        app = new App({ sinkron })
        await app.init()

        const c = app.controller
        const user1Res = await c.users.createUser("user1", "password")
        console.log("RES", user1Res)
        if (user1Res.isOk) user1Id = user1Res.value.id
        const user2Res = await c.users.createUser("user2", "password")
        if (user2Res.isOk) user2Id = user2Res.value.id
        const spaceRes = await c.spaces.create({
            name: "space",
            ownerId: user1Id
        })
        if (spaceRes.isOk) spaceId = spaceRes.value.id
    })

    it("send invite", async () => {
        const c = app!.controller

        // invalid fromId
        const res1 = await c.invites.create({
            fromId: "invalid",
            toId: user2Id,
            spaceId: spaceId,
            role: "admin"
        })
        assert(res1.isError, "invalid fromId")

        // invalid toId
        const res2 = await c.invites.create({
            fromId: user1Id,
            toId: "invalid",
            spaceId: spaceId,
            role: "admin"
        })
        assert(res2.isError, "invalid toId")

        // invalid spaceId
        const res3 = await c.invites.create({
            fromId: user1Id,
            toId: user2Id,
            spaceId: "invalid",
            role: "admin"
        })
        assert(res3.isError, "invalid spaceId")
    })
})
