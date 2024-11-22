import assert from "node:assert"
import { v4 as uuidv4 } from "uuid"
import { LoroDoc } from "loro-crdt"

import { toLoro } from "@sinkron/loro-slate"

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

const createDoc = (content: object) => {
    const doc = new LoroDoc()
    const root = doc.getMap("root")
    root.setContainer("content", toLoro(content as any))
    return doc
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

        const content = {
            children: [{ type: "title", children: [{ text: "Hello" }] }]
        }
        const loroDoc = createDoc(content)
        const docId = uuidv4()
        const col = `spaces/${spaceId}`
        const res1 = await app.sinkron.createDocument({
            id: docId,
            col,
            data: loroDoc.export({ mode: "snapshot" })
        })
        assert(res1.isOk, "create doc ok")

        // publish
        const res2 = await app.fastify.inject({
            method: "POST",
            url: "/posts/new",
            headers: authHeaders,
            payload: { spaceId, docId }
        })
        assert.strictEqual(res2.statusCode, 200, "create post ok")

        // check
        const res3 = await app.fastify.inject({
            method: "GET",
            url: `/posts/${docId}`,
            headers: authHeaders
        })
        assert.strictEqual(res3.statusCode, 200, "get post ok")

        const res4 = await app.fastify.inject({
            method: "GET",
            url: `/posts/${docId}/content`,
            headers: authHeaders
        })
        assert.strictEqual(res4.statusCode, 200, "get post content ok")
        const postContent = JSON.parse(res4.body)
        assert.deepEqual(content, postContent, "post content")

        // update
        const newContent = {
            children: [{ type: "title", children: [{ text: "New" }] }]
        }
        await app.sinkron.updateDocumentWithCallback({
            id: docId,
            col,
            cb: (doc) => {
                doc.getMap("root").setContainer(
                    "content",
                    toLoro(newContent as any)
                )
            }
        })
        const res5 = await app.fastify.inject({
            method: "POST",
            url: `/posts/${docId}/update`,
            headers: authHeaders
        })
        assert.strictEqual(res5.statusCode, 200, "post update ok")

        const res6 = await app.fastify.inject({
            method: "GET",
            url: `/posts/${docId}/content`,
            headers: authHeaders
        })
        assert.strictEqual(res6.statusCode, 200, "get updated ok")
        const newPostContent = JSON.parse(res6.body)
        assert.deepEqual(newContent, newPostContent, "new content")

        // unpublish
        const res7 = await app.fastify.inject({
            method: "POST",
            url: `/posts/${docId}/unpublish`,
            headers: authHeaders
        })
        assert.strictEqual(res7.statusCode, 200, "unpublish ok")
    })
})
