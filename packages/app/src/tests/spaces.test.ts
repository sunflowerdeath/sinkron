import assert from "node:assert"

import * as Automerge from "@automerge/automerge"
import { v4 as uuidv4 } from "uuid"
import { Action } from "sinkron"

// import { Sinkron } from "sinkron"
import { App } from "../app"
import { User } from "../entities"

describe("Spaces", () => {
    let app: App
    let user: User | undefined
    // let user2
    let headers: { [key: string]: string }

    beforeEach(async () => {
        app = new App()
        await app.init()

        const res = await app.services.users.create(
            app.models,
            "test@sinkron.xyz"
        )
        assert(res.isOk, "user")
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
        assert(tokenRes.isOk, "token")
        headers = { "x-sinkron-auth-token": tokenRes.value.token }
    })

    afterEach(async () => {
        await app.destroy()
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
        const res = await app.fastify.inject({
            method: "POST",
            url: "/spaces/new",
            headers,
            payload: { name: "test" }
        })
        assert.strictEqual(res.statusCode, 200, "create space")
        const space = JSON.parse(res.payload)

        // create doc
        const docId = uuidv4()
        const doc = Automerge.from({
            content: [],
            isLocked: false
        })
        const res2 = await app.sinkron.createDocument(
            docId,
            `spaces/${space.id}`,
            Automerge.save(doc)
        )
        assert(res2.isOk, "create doc")

        // lock
        const res3 = await app.fastify.inject({
            method: "POST",
            url: `/spaces/${space.id}/lock/${docId}`,
            headers
        })
        assert.strictEqual(res3.statusCode, 200, "locked")

        // check is locked
        const res4 = await app.sinkron.checkDocumentPermission({
            id: docId,
            user: user!.id,
            action: Action.update
        })
        assert(res4.isOk, "check permissions")
        assert(!res4.value, "update not permitted")

        const res5 = await app.sinkron.checkDocumentPermission({
            id: docId,
            user: user!.id,
            action: Action.delete
        })
        assert(res5.isOk, "check permissions")
        assert(!res5.value, "delete not permitted")

        const res6 = await app.sinkron.getDocument(docId)
        assert(res6 !== null, "doc")
        const lockedDoc = Automerge.load(res6.data!)
        assert("isLocked" in lockedDoc && lockedDoc.isLocked, "is locked")

        // unlock
        const res7 = await app.fastify.inject({
            method: "POST",
            url: `/spaces/${space.id}/unlock/${docId}`,
            headers
        })
        assert.strictEqual(res7.statusCode, 200, "unlocked")

        // check is unlocked
        const res8 = await app.sinkron.checkDocumentPermission({
            id: docId,
            user: user!.id,
            action: Action.update
        })
        assert(res8.isOk, "check permissions")
        assert(res8.value, "permitted")

        const res9 = await app.sinkron.getDocument(docId)
        assert(res9 !== null, "doc")
        const unlockedDoc = Automerge.load(res9.data!)
        assert(
            "isLocked" in unlockedDoc && !unlockedDoc.isLocked,
            "is unlocked"
        )
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
            "user@sinkron.xyz"
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
