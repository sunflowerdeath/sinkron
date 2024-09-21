import assert from "node:assert"
import * as Automerge from "@automerge/automerge"
import { v4 as uuidv4 } from "uuid"

import { Sinkron } from "./core"
import { Permissions, Role, Action, emptyPermissionsTable } from "./permissions"

type Doc = {
    text: string
    num: number
}


const makeDoc = () => {
    let doc = Automerge.init<Doc>()
    doc = Automerge.change(doc, (doc) => {
        doc.text = "Hello"
        doc.num = 0
    })
    return doc
}

describe("Sinkron", () => {
    let sinkron: Sinkron

    before(async () => {
        await Automerge.wasmInitialized()
    })

    beforeEach(async () => {
        sinkron = new Sinkron({ dbPath: ":memory:" })
        await sinkron.init()
        await sinkron.createCollection({
            id: "test",
            permissions: emptyPermissionsTable
        })
    })

    it("create", async () => {
        const id = uuidv4()
        const doc = makeDoc()

        // collection does not exist
        const res = await sinkron.createDocument(
            id,
            "ERROR",
            Automerge.save(doc)
        )
        assert(!res.isOk)

        // created successfully
        const res1 = await sinkron.createDocument(
            id,
            "test",
            Automerge.save(doc)
        )
        assert(res1.isOk)
        assert.strictEqual(res1.value.id, id)

        // duplicate id
        const res2 = await sinkron.createDocument(
            id,
            "test",
            Automerge.save(doc)
        )
        assert(!res2.isOk)
    })

    it("update", async () => {
        const id = uuidv4()
        let doc = makeDoc()

        const res = await sinkron.createDocument(
            id,
            "test",
            Automerge.save(doc)
        )
        assert(res.isOk)
        assert.strictEqual(res.value.colrev, 2)

        // successfull update
        doc = Automerge.change(doc, (doc) => {
            doc.num = 100
        })
        const change = Automerge.getLastLocalChange(doc)!

        const res2 = await sinkron.updateDocument(id, [change])
        assert(res2.isOk)
        assert.strictEqual(res2.value.colrev, 3)
        const updatedDoc = Automerge.load<Doc>(res2.value.data!)
        assert.strictEqual(updatedDoc.num, 100)

        const res3 = await sinkron.updateDocument("WRONG_ID", [change])
        assert(!res3.isOk)

        // bad change
        const badChange = new Uint8Array([1, 2, 3])
        const res4 = await sinkron.updateDocument(id, [badChange])
        assert(!res4.isOk)
    })

    it("permissions", async () => {
        const user = "1"
        const user2 = "2"

        const permissions = new Permissions()
        permissions.add(Action.read, Role.user(user))
        permissions.add(Action.create, Role.user(user))
        permissions.add(Action.update, Role.user(user))
        permissions.add(Action.delete, Role.user(user))
        await sinkron.createCollection({
            id: "perm_test",
            permissions: permissions.table
        })
        await sinkron.createDocument(
            "perm_test_doc",
            "perm_test",
            Automerge.save(makeDoc())
        )

        // has permission
        const res = await sinkron.checkCollectionPermission({
            id: "perm_test",
            user,
            action: Action.read
        })
        assert(res.isOk)
        assert.strictEqual(res.value, true)

        const res2 = await sinkron.checkDocumentPermission({
            id: "perm_test_doc",
            user,
            action: Action.update
        })
        assert(res2.isOk)
        assert.strictEqual(res2.value, true)

        // no permission
        const res3 = await sinkron.checkCollectionPermission({
            id: "perm_test",
            user: user2,
            action: Action.read
        })
        assert(res3.isOk)
        assert.strictEqual(res3.value, false)

        const res4 = await sinkron.checkDocumentPermission({
            id: "perm_test_doc",
            user: user2,
            action: Action.update
        })
        assert(res4.isOk)
        assert.strictEqual(res4.value, false)

        // update permissions
        await sinkron.updateDocumentPermissions("perm_test_doc", (p) => {
            p.add(Action.update, Role.user(user2))
        })
        await sinkron.updateCollectionPermissions("perm_test", (p) => {
            p.add(Action.read, Role.user(user2))
        })

        const res5 = await sinkron.checkCollectionPermission({
            id: "perm_test",
            user: user2,
            action: Action.read
        })
        assert(res5.isOk)
        assert.strictEqual(res5.value, true)

        const res6 = await sinkron.checkDocumentPermission({
            id: "perm_test_doc",
            user: user2,
            action: Action.update
        })
        assert(res6.isOk)
        assert.strictEqual(res6.value, true)
    })

    it("refs", async () => {
        const res = await sinkron.createCollection({
            id: "ref_test",
            permissions: emptyPermissionsTable,
            ref: true
        })
        assert(res.isOk, "res")

        const id = uuidv4()
        const doc = makeDoc()
        const res2 = await sinkron.createDocument(
            id,
            "test",
            Automerge.save(doc)
        )
        assert(res2.isOk, "res2")

        const res3 = await sinkron.addDocumentToCollection("ref_test", id)
        assert(res3.isOk, "res3")

        // already added
        const res4 = await sinkron.addDocumentToCollection("ref_test", id)
        assert(!res4.isOk, "res4")

        const res5 = await sinkron.removeDocumentFromCollection("ref_test", id)
        assert(res5.isOk, "res5")
    })
})
