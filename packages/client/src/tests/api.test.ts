import assert from "node:assert"

import { v4 as uuidv4 } from "uuid"
import { LoroDoc } from "loro-crdt"

import { SinkronApi, ErrorCode } from "../api"
import { Permissions } from "../permissions"

import { assertIsMatch } from "./utils"

const url = "http://localhost:3000"
const token = "SINKRON_API_TOKEN"

describe("SinkronApi", () => {
    it("auth", async () => {
        const permissions = new Permissions()

        const invalidUrlApi = new SinkronApi({
            url: "INVALID",
            token: "INVALID"
        })
        const invalidUrlRes = await invalidUrlApi.createCollection({
            id: "test",
            permissions
        })
        assert(!invalidUrlRes.isOk, "fetch error")
        assert.strictEqual(invalidUrlRes.error.code, ErrorCode.FetchError)

        const invalidTokenApi = new SinkronApi({ url, token: "INVALID" })
        const invalidTokenRes = await invalidTokenApi.createCollection({
            id: "test",
            permissions
        })
        assert(!invalidTokenRes.isOk, "auth failed")
        assert.strictEqual(invalidTokenRes.error.code, ErrorCode.AuthFailed)
    })

    it("collections", async () => {
        const api = new SinkronApi({ url, token })

        const permissions = new Permissions()
        const createRes = await api.createCollection({
            id: "test",
            permissions
        })
        assert(createRes.isOk, "create")

        const duplicateRes = await api.createCollection({
            id: "test",
            permissions
        })
        assert(!duplicateRes.isOk, "duplicate")
        assert.strictEqual(
            duplicateRes.error.code,
            ErrorCode.UnprocessableContent,
            "duplicate"
        )

        const getRes = await api.getCollection("test")
        assert(getRes.isOk, "get")

        const notFoundRes = await api.getCollection("not_found")
        assert(!notFoundRes.isOk, "not found")
        assert.strictEqual(
            notFoundRes.error.code,
            ErrorCode.NotFound,
            "not found"
        )

        // const deleteRes = await api.deleteCollection("test")
        // assert(deleteRes.isOk, "delete")
    })

    it("documents", async () => {
        const api = new SinkronApi({ url, token })

        const col = uuidv4()
        const permissions = new Permissions()
        const createColRes = await api.createCollection({
            id: col,
            permissions
        })
        assert(createColRes.isOk, "create col: ok")

        // create
        const id = uuidv4()
        const loroDoc = new LoroDoc()
        loroDoc.getText("text").insert(0, "Hello")
        const snapshot = loroDoc.export({ mode: "snapshot" })
        const createRes = await api.createDocument({ id, col, data: snapshot })
        assert(createRes.isOk, "create: ok")

        // duplicate
        const duplicateRes = await api.createDocument({
            id,
            col,
            data: snapshot
        })
        assert(!duplicateRes.isOk, "duplicate")
        assert.strictEqual(
            duplicateRes.error.code,
            ErrorCode.UnprocessableContent,
            "duplicate"
        )

        // get
        const getRes = await api.getDocument({ id, col })
        assert(getRes.isOk, "get")

        // not found
        const notFoundRes = await api.getDocument({ id: uuidv4(), col })
        assert(!notFoundRes.isOk, "not found")
        assert.strictEqual(
            notFoundRes.error.code,
            ErrorCode.NotFound,
            "not found"
        )

        // col not found
        const colNotFoundRes = await api.getDocument({ id, col: uuidv4() })
        assert(!colNotFoundRes.isOk, "col not found")
        assert.strictEqual(
            colNotFoundRes.error.code,
            ErrorCode.NotFound,
            "col not found"
        )

        // update
        const version = loroDoc.version()
        loroDoc.getText("text").insert(5, ", world!")
        const update = loroDoc.export({ mode: "update", from: version })
        const updateRes = await api.updateDocument({ id, col, data: update })
        assert(updateRes.isOk, "update")

        // delete
        const deleteRes = await api.deleteDocument({ id, col })
        assert(deleteRes.isOk, "delete")
        assert.strictEqual(deleteRes.value.data, null, "delete")

        // already deleted
        const alreadyDeletedRes = await api.deleteDocument({ id, col })
        assert(!alreadyDeletedRes.isOk, "already deleted")
        assert.strictEqual(
            alreadyDeletedRes.error.code,
            ErrorCode.UnprocessableContent,
            "already deleted"
        )

        // update deleted
        const updateDeletedRes = await api.updateDocument({
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

    it("groups", async () => {
        const api = new SinkronApi({ url, token })

        const col = uuidv4()
        const permissions = new Permissions()
        const createColRes = await api.createCollection({
            id: col,
            permissions
        })
        assert(createColRes.isOk, "createCollection")

        const createGroupRes = await api.createGroup("group")
        assert(createGroupRes.isOk, "createGroup")

        const addToGroupRes = await api.addUserToGroup({
            user: "user",
            group: "group"
        })
        assert(addToGroupRes.isOk, "addUserToGroup")

        const getGroupRes = await api.getGroup("group")
        assert(getGroupRes.isOk, "getGroup")
        const group = getGroupRes.value
        assertIsMatch(group, { id: "group", members: ["user"] })

        const getUserRes = await api.getUser("user")
        assert(getUserRes.isOk, "getUser")
        const user = getUserRes.value
        assertIsMatch(user, { id: "user", groups: ["group"] })

        const removeUserRes = await api.removeUserFromGroup({
            user: "user",
            group: "group"
        })
        assert(removeUserRes.isOk, "removeUserFromGroup")

        const removeUserFromAllRes = await api.removeUserFromAllGroups("user")
        assert(removeUserFromAllRes.isOk, "removeUserFromAllGroups")

        const deleteGroupRes = await api.deleteGroup("group")
        assert(deleteGroupRes.isOk, "deleteGroup")
    })
})
