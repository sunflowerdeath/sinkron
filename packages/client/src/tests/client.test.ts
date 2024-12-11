import assert from "node:assert"

import { v4 as uuidv4 } from "uuid"
import { LoroDoc } from "loro-crdt"

import { SinkronClient, ErrorCode, Permissions } from "../client"

import { assertIsMatch } from "./utils"

const url = "http://localhost:3000"
const token = "SINKRON_API_TOKEN"

describe("SinkronClient", () => {
    it("auth", async () => {
        const permissions = Permissions.any()

        const invalidUrlClient = new SinkronClient({
            url: "INVALID",
            token: "INVALID"
        })
        const invalidUrlRes = await invalidUrlClient.createCollection({
            id: uuidv4(),
            permissions
        })
        assert(!invalidUrlRes.isOk, "fetch error")
        assert.strictEqual(invalidUrlRes.error.code, ErrorCode.FetchError)

        const invalidTokenClient = new SinkronClient({ url, token: "INVALID" })
        const invalidTokenRes = await invalidTokenClient.createCollection({
            id: uuidv4(),
            permissions
        })
        assert(!invalidTokenRes.isOk, "auth failed")
        assert.strictEqual(invalidTokenRes.error.code, ErrorCode.AuthFailed)
    })

    it("collections", async () => {
        const sinkron = new SinkronClient({ url, token })

        const col = uuidv4()
        const permissions = Permissions.any()
        const createRes = await sinkron.createCollection({
            id: col,
            permissions
        })
        assertIsMatch(createRes, {
            isOk: true,
            value: { id: col, colrev: 0 }
        })

        const duplicateRes = await sinkron.createCollection({
            id: col,
            permissions
        })
        assert(!duplicateRes.isOk, "duplicate")
        assertIsMatch(duplicateRes, {
            isOk: false,
            error: { code: ErrorCode.UnprocessableContent }
        })

        const getRes = await sinkron.getCollection(col)
        assertIsMatch(getRes, {
            isOk: true,
            value: { id: col, colrev: 0 }
        })

        const notFoundRes = await sinkron.getCollection("not_found")
        assertIsMatch(notFoundRes, {
            isOk: false,
            error: { code: ErrorCode.NotFound }
        })

        // const deleteRes = await sinkron.deleteCollection("test")
        // assert(deleteRes.isOk, "delete")
    })

    it("documents", async () => {
        const sinkron = new SinkronClient({ url, token })

        const col = uuidv4()
        const permissions = Permissions.any()
        const createColRes = await sinkron.createCollection({
            id: col,
            permissions
        })
        assert(createColRes.isOk, "create col: ok")

        // create
        const id = uuidv4()
        const loroDoc = new LoroDoc()
        loroDoc.getText("text").insert(0, "Hello")
        const snapshot = loroDoc.export({ mode: "snapshot" })
        const createRes = await sinkron.createDocument({
            id,
            col,
            data: snapshot
        })
        assertIsMatch(createRes, {
            isOk: true,
            value: { id, col }
        })

        // duplicate
        const duplicateRes = await sinkron.createDocument({
            id,
            col,
            data: snapshot
        })
        assertIsMatch(duplicateRes, {
            isOk: false,
            error: { code: ErrorCode.UnprocessableContent }
        })

        // get
        const getRes = await sinkron.getDocument({ id, col })
        assert(getRes.isOk, "get")

        // not found
        const notFoundRes = await sinkron.getDocument({ id: uuidv4(), col })
        assert(!notFoundRes.isOk, "not found")
        assert.strictEqual(
            notFoundRes.error.code,
            ErrorCode.NotFound,
            "not found"
        )

        // col not found
        const colNotFoundRes = await sinkron.getDocument({ id, col: uuidv4() })
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
        const updateRes = await sinkron.updateDocument({
            id,
            col,
            data: update
        })
        assert(updateRes.isOk, "update")

        // delete
        const deleteRes = await sinkron.deleteDocument({ id, col })
        assert(deleteRes.isOk, "delete")
        assert.strictEqual(deleteRes.value.data, null, "delete")

        // already deleted
        const alreadyDeletedRes = await sinkron.deleteDocument({ id, col })
        assert(!alreadyDeletedRes.isOk, "already deleted")
        assert.strictEqual(
            alreadyDeletedRes.error.code,
            ErrorCode.UnprocessableContent,
            "already deleted"
        )

        // update deleted
        const updateDeletedRes = await sinkron.updateDocument({
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
        const sinkron = new SinkronClient({ url, token })

        const col = uuidv4()
        const permissions = Permissions.any()
        const createColRes = await sinkron.createCollection({
            id: col,
            permissions
        })
        assert(createColRes.isOk, "createCollection")

        const createGroupRes = await sinkron.createGroup("group")
        assert(createGroupRes.isOk, "createGroup")

        const addToGroupRes = await sinkron.addUserToGroup({
            user: "user",
            group: "group"
        })
        assert(addToGroupRes.isOk, "addUserToGroup")

        const getGroupRes = await sinkron.getGroup("group")
        assert(getGroupRes.isOk, "getGroup")
        const group = getGroupRes.value
        assertIsMatch(group, { id: "group", members: ["user"] })

        const getUserRes = await sinkron.getUser("user")
        assert(getUserRes.isOk, "getUser")
        const user = getUserRes.value
        assertIsMatch(user, { id: "user", groups: ["group"] })

        const removeUserRes = await sinkron.removeUserFromGroup({
            user: "user",
            group: "group"
        })
        assert(removeUserRes.isOk, "removeUserFromGroup")

        const removeUserFromAllRes = await sinkron.removeUserFromAllGroups(
            "user"
        )
        assert(removeUserFromAllRes.isOk, "removeUserFromAllGroups")

        const deleteGroupRes = await sinkron.deleteGroup("group")
        assert(deleteGroupRes.isOk, "deleteGroup")
    })
})
