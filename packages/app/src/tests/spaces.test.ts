import assert from "node:assert"

import { LoroDoc } from "loro-crdt"
import { v4 as uuidv4 } from "uuid"

import { Action } from "@sinkron/client"
import { App } from "../app"
import { User } from "../entities"

import { fakeMail } from "./utils"

const createDoc = () => {
    const doc = new LoroDoc()
    const root = doc.getMap("root")
    root.set("isLocked", false)
    return doc
}

describe("Spaces", () => {
    let app = new App()
    let user: User | undefined
    let headers: { [key: string]: string }

    before(async () => {
        await app.init()
    })

    after(async () => {
        await app.destroy()
    })

    beforeEach(async () => {
        // create random user & login
        const res = await app.services.users.create(app.models, fakeMail())
        assert(res.isOk, "user")
        user = res.value
        const tokenRes = await app.services.auth.issueAuthToken(app.models, {
            userId: user.id
        })
        assert(tokenRes.isOk, "token")
        headers = { "x-sinkron-auth-token": tokenRes.value.token }
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
        const response = JSON.parse(res2.payload)
        assert(
            Array.isArray(response.members) && response.members.length === 1,
            "1 member"
        )
        const memberId = response.members[0].id

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

    it("lock, unlock", async () => {
        // create space
        const createSpaceRes = await app.fastify.inject({
            method: "POST",
            url: "/spaces/new",
            headers,
            payload: { name: "test" }
        })
        assert.strictEqual(createSpaceRes.statusCode, 200, "create space")
        const space = JSON.parse(createSpaceRes.payload)

        // create doc
        const docId = uuidv4()
        const col = `spaces/${space.id}`
        const doc = createDoc()
        const createDocRes = await app.sinkron.createDocument({
            id: docId,
            col,
            data: doc.export({ mode: "snapshot" })
        })
        assert(createDocRes.isOk, "create doc")

        // lock
        const lockRes = await app.fastify.inject({
            method: "POST",
            url: `/spaces/${space.id}/lock/${docId}`,
            headers
        })
        assert.strictEqual(lockRes.statusCode, 200, "lock")

        const getUserRes = await app.sinkron.getUser(user!.email)
        assert(getUserRes.isOk, "get user object")
        const userObject = getUserRes.value

        // check locked
        const getLockedDocRes = await app.sinkron.getDocument({
            id: docId,
            col
        })
        assert(getLockedDocRes.isOk)
        const lockedDoc = getLockedDocRes.value
        assert(lockedDoc !== null, "get locked doc")

        // isLocked is set
        const lockedDocContent = LoroDoc.fromSnapshot(lockedDoc.data!)
        assert(
            lockedDocContent.getMap("root").get("isLocked"),
            "isLocked is set"
        )

        // read is permitted
        const readIsPermitted = lockedDoc.permissions.check(
            userObject,
            Action.read
        )
        assert(readIsPermitted, "read is permitted")

        // update is not permitted
        const updateIsPermitted = lockedDoc.permissions.check(
            userObject,
            Action.update
        )
        assert(!updateIsPermitted, "update is not permitted")

        // unlock
        const unlockRes = await app.fastify.inject({
            method: "POST",
            url: `/spaces/${space.id}/unlock/${docId}`,
            headers
        })
        assert.strictEqual(unlockRes.statusCode, 200, "unlock")

        // check unlocked
        const getUnlockedDocRes = await app.sinkron.getDocument({
            id: docId,
            col
        })
        assert(getUnlockedDocRes.isOk)
        assert(getUnlockedDocRes.value !== null, "get unlocked doc")
        const unlockedDoc = getUnlockedDocRes.value

        // isLocked not set
        const unlockedDocContent = LoroDoc.fromSnapshot(unlockedDoc.data!)
        assert(
            !unlockedDocContent.getMap("root").get("isLocked"),
            "isLocked not set"
        )
        // update is permitted
        const updateIsPermittedUnlocked = unlockedDoc.permissions.check(
            userObject,
            Action.update
        )
        assert(updateIsPermittedUnlocked, "update is permitted")
    })

    it("members update / remove", async () => {
        // create space
        const res = await app.fastify.inject({
            method: "POST",
            url: "/spaces/new",
            headers,
            payload: { name: "test" }
        })
        assert.strictEqual(res.statusCode, 200, "create space")
        const space = JSON.parse(res.payload)

        const createUserRes = await app.services.users.create(
            app.models,
            fakeMail()
        )
        assert(createUserRes.isOk, "create user")
        const memberUser = createUserRes.value

        await app.services.spaces.addMember(app.models, {
            userId: memberUser.id,
            spaceId: space.id,
            role: "admin"
        })

        // update role
        const updateRoleResSelf = await app.fastify.inject({
            method: "POST",
            url: `/spaces/${space.id}/members/${user!.id}/update`,
            headers,
            payload: { role: "readonly" }
        })
        assert.notStrictEqual(updateRoleResSelf.statusCode, 200, "update self")

        const updateRoleRes = await app.fastify.inject({
            method: "POST",
            url: `/spaces/${space.id}/members/${memberUser.id}/update`,
            headers,
            payload: { role: "readonly" }
        })
        assert.strictEqual(updateRoleRes.statusCode, 200, "update")
        const updated = JSON.parse(updateRoleRes.payload)
        assert.strictEqual(updated.role, "readonly", "update")

        // remove member
        const removeResSelf = await app.fastify.inject({
            method: "POST",
            url: `/spaces/${space.id}/members/${user!.id}/remove`,
            headers
        })
        assert.notStrictEqual(removeResSelf.statusCode, 200, "remove self")

        const removeRes = await app.fastify.inject({
            method: "POST",
            url: `/spaces/${space.id}/members/${memberUser.id}/remove`,
            headers
        })
        assert.strictEqual(removeRes.statusCode, 200, "remove")
    })
})
