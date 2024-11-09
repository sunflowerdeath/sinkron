import assert from "node:assert"

import { v4 as uuidv4 } from "uuid"
import { LoroDoc } from "loro-crdt"

import { SinkronApi, ErrorCode } from "../index"
import { Permissions } from "../permissions"

let url = "http://localhost:3000"
let token = "SINKRON_API_TOKEN"

describe("SinkronApi", () => {
    it("auth", async () => {
        let permissions = new Permissions()

        let invalidUrlApi = new SinkronApi({ url: "INVALID", token: "INVALID" })
        let invalidUrlRes = await invalidUrlApi.createCollection({
            id: "test",
            permissions
        })
        assert(!invalidUrlRes.isOk, "fetch error")
        assert.strictEqual(invalidUrlRes.error.code, ErrorCode.FetchError)

        let invalidTokenApi = new SinkronApi({ url, token: "INVALID" })
        let invalidTokenRes = await invalidTokenApi.createCollection({
            id: "test",
            permissions
        })
        assert(!invalidTokenRes.isOk, "auth failed")
        assert.strictEqual(invalidTokenRes.error.code, ErrorCode.AuthFailed)
    })

    it("collections", async () => {
        let api = new SinkronApi({ url, token })

        let permissions = new Permissions()
        let createRes = await api.createCollection({ id: "test", permissions })
        assert(createRes.isOk, "create")

        let duplicateRes = await api.createCollection({
            id: "test",
            permissions
        })
        assert(!duplicateRes.isOk, "duplicate")
        assert.strictEqual(
            duplicateRes.error.code,
            ErrorCode.UnprocessableContent,
            "duplicate"
        )

        let getRes = await api.getCollection("test")
        assert(getRes.isOk, "get")

        let notFoundRes = await api.getCollection("not_found")
        assert(!notFoundRes.isOk, "not found")
        assert.strictEqual(
            notFoundRes.error.code,
            ErrorCode.NotFound,
            "not found"
        )

        // let deleteRes = await api.deleteCollection("test")
        // assert(deleteRes.isOk, "delete")
    })

    it.only("documents", async () => {
        let api = new SinkronApi({ url, token })

        let col = uuidv4()
        let permissions = new Permissions()
        let createColRes = await api.createCollection({ id: col, permissions })
        assert(createColRes.isOk, "create col: ok")

        // create
        let id = uuidv4()
        let loroDoc = new LoroDoc()
        loroDoc.getText("text").insert(0, "Hello")
        let snapshot = loroDoc.export({ mode: "snapshot" })
        let createRes = await api.createDocument({ id, col, data: snapshot })
        assert(createRes.isOk, "create: ok")

        // duplicate
        let duplicateRes = await api.createDocument({ id, col, data: snapshot })
        assert(!duplicateRes.isOk, "duplicate")
        assert.strictEqual(
            duplicateRes.error.code,
            ErrorCode.UnprocessableContent,
            "duplicate"
        )

        // get
        let getRes = await api.getDocument({ id, col })
        assert(getRes.isOk, "get")

        // not found
        let notFoundRes = await api.getDocument({ id: uuidv4(), col })
        assert(!notFoundRes.isOk, "not found")
        assert.strictEqual(
            notFoundRes.error.code,
            ErrorCode.NotFound,
            "not found"
        )

        // col not found
        let colNotFoundRes = await api.getDocument({ id, col: uuidv4() })
        assert(!colNotFoundRes.isOk, "col not found")
        assert.strictEqual(
            colNotFoundRes.error.code,
            ErrorCode.NotFound,
            "col not found"
        )

        // update
        let version = loroDoc.version()
        loroDoc.getText("text").insert(5, ", world!")
        let update = loroDoc.export({ mode: "update", from: version })
        let updateRes = await api.updateDocument({ id, col, data: update })
        assert(updateRes.isOk, "update")

        // delete
        let deleteRes = await api.deleteDocument({ id, col })
        assert(deleteRes.isOk, "delete")
        assert.strictEqual(deleteRes.value.data, null, "delete")

        // already deleted
        let alreadyDeletedRes = await api.deleteDocument({ id, col })
        assert(!alreadyDeletedRes.isOk, "already deleted")
        assert.strictEqual(
            alreadyDeletedRes.error.code,
            ErrorCode.UnprocessableContent,
            "already deleted"
        )

        // update deleted
        let updateDeletedRes = await api.updateDocument({
            id,
            col,
            data: update
        })
        assert(!updateDeletedRes.isOk, "update deleted")
        assert.strictEqual(
            updateDeletedRes.error.code,
            ErrorCode.UnprocessableContent,
            "update deleted"
        )
    })

    it("groups", () => {
        // create group
        // add user to group
        // remove user from group
        // remove user from all groups
    })
})
