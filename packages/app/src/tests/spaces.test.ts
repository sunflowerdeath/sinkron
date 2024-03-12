import assert from "node:assert"

import { Sinkron } from "sinkron"
import { App } from "../app"

describe("SpacesController", () => {
    let app
    let user
    let user2

    beforeEach(async () => {
        const sinkron = new Sinkron({ dbPath: ":memory: " })
        await sinkron.init()
        app = new App({ sinkron, dbPath: ":memory:" })
        await app.init()

        const c = app!.controller
        const res = await c.users.createUser("test", "password")
        assert(res.isOk)
        user = res.value

        const res2 = await c.users.createUser("user2", "password")
        assert(res2.isOk)
        user2 = res2.value
    })

    it("create delete members", async () => {
        const c = app!.controller

        const res = await c.spaces.create({ ownerId: user!.id, name: "test" })
        assert(res.isOk, "created")
        const space = res.value

        const res2 = await c.spaces.getUserSpaces(user!.id)
        assert(res2.isOk)
        const spaces = res2.value
        assert.strictEqual(spaces.length, 2)

        const res3 = await c.spaces.removeMember({
            spaceId: space.id,
            userId: user!.id
        })
        assert(!res3.isOk, "can't delete owner")

        const res4 = await c.spaces.removeMember({
            spaceId: space.id,
            userId: user2!.id
        })
        assert(!res4.isOk, "not found member")

        const res5 = await c.spaces.addMember({
            spaceId: space.id,
            userId: user2!.id,
            role: "editor"
        })
        assert(res5.isOk, "add member")

        const res6 = await c.spaces.addMember({
            spaceId: space.id,
            userId: user2!.id,
            role: "editor"
        })
        assert(!res6.isOk, "add existing")

        const res7 = await c.spaces.getMembers(space.id)
        assert(res7.isOk, "get members")
        const members = res7.value
        assert.strictEqual(members.length, 2, "2 members")

        const res8 = await c.spaces.delete(space.id)
        assert(res8.isOk, "delete space")
    })
})
