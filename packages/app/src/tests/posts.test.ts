import assert from "node:assert"
import { v4 as uuidv4 } from "uuid"
import * as Automerge from "@automerge/automerge"

import { App } from "../app"
import { Profile } from "../services/user"

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
    return { "x-sinkron-auth-token": res.value.token }
}

describe("Posts", () => {
    let app: App
    let user: Profile

    beforeEach(async () => {
        app = new App()
        await app.init()
        user = await createUser(app, "test@sinkron.xyz")
    })

    afterEach(async () => {
        await app.destroy()
    })

    it("publish", async () => {
        const authHeaders = await getAuthHeaders(app, user.id)
        const spaceId = user.spaces[0].id

        const doc = {
            content: [{ type: "title", children: [{ text: "Hello" }] }]
        }
        const docId = uuidv4()
        const res1 = await app.sinkron.createDocument(
            docId,
            `spaces/${spaceId}`,
            Automerge.save(Automerge.from(doc))
        )
        assert(res1.isOk, "res1")

        // publish
        const res2 = await app.fastify.inject({
            method: "POST",
            url: "/posts/new",
            headers: authHeaders,
            payload: { spaceId, docId }
        })
        assert(res2.statusCode === 200, "res2")

        // check
        const res3 = await app.fastify.inject({
            method: "GET",
            url: `/posts/${docId}`,
            headers: authHeaders
        })
        assert(res3.statusCode === 200, "res3")

        const res4 = await app.fastify.inject({
            method: "GET",
            url: `/posts/${docId}/content`,
            headers: authHeaders
        })
        assert(res4.statusCode === 200, "res4")
        const content = JSON.parse(res4.body)
        assert.deepEqual(content, doc.content, "content")

        // update
        const newDoc = {
            content: [{ type: "title", children: [{ text: "New" }] }]
        }
        await app.sinkron.updateDocumentWithCallback(docId, (doc) => {
            doc.content = newDoc.content
        })
        const res5 = await app.fastify.inject({
            method: "POST",
            url: `/posts/${docId}/update`,
            headers: authHeaders
        })
        assert(res5.statusCode === 200, "res5")

        const res6 = await app.fastify.inject({
            method: "GET",
            url: `/posts/${docId}/content`,
            headers: authHeaders
        })
        assert(res6.statusCode === 200, "res6")
        const newContent = JSON.parse(res6.body)
        assert.deepEqual(newContent, newDoc.content, "update")

        // unpublish
        const res7 = await app.fastify.inject({
            method: "POST",
            url: `/posts/${docId}/unpublish`,
            headers: authHeaders
        })
        assert(res7.statusCode === 200, "res7")
    })
})
