import assert from "node:assert"

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
        console.log(createRes)
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

        let deleteRes = await api.deleteCollection("test")
        assert(deleteRes.isOk, "delete")
    })

    it("documents", () => {
        // create
        // get
        // update
        // delete
    })

    it("groups", () => {
        // create group
        // add user to group
        // remove user from group
        // remove user from all groups
    })
})
