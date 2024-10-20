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
        sinkron = new Sinkron({
            db: {
                host: "localhost",
                port: 5001,
                username: "user",
                password: "password",
                database: "sinkron",
                synchronize: true
            }
        })
        await sinkron.init()
    })

    it("create", async () => {
        const colId = uuidv4()
        await sinkron.createCollection({
            id: colId,
            permissions: emptyPermissionsTable()
        })

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
        const colId = uuidv4()
        await sinkron.createCollection({
            id: colId,
            permissions: emptyPermissionsTable()
        })

        const docId = uuidv4()
        let doc = makeDoc()

        const res = await sinkron.createDocument(
            docId,
            colId,
            Automerge.save(doc)
        )
        assert(res.isOk)
        assert.strictEqual(res.value.colrev, 2)

        // successfull update
        doc = Automerge.change(doc, (doc) => {
            doc.num = 100
        })
        const change = Automerge.getLastLocalChange(doc)!

        const res2 = await sinkron.updateDocument(docId, [change])
        assert(res2.isOk)
        assert.strictEqual(res2.value.colrev, 3)
        const updatedDoc = Automerge.load<Doc>(res2.value.data!)
        assert.strictEqual(updatedDoc.num, 100)

        const res3 = await sinkron.updateDocument(uuidv4(), [change])
        assert(!res3.isOk)

        // bad change
        const badChange = new Uint8Array([1, 2, 3])
        const res4 = await sinkron.updateDocument(docId, [badChange])
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
        const colId = uuidv4()
        await sinkron.createCollection({
            id: colId,
            permissions: permissions.table
        })

        const docId = uuidv4()
        await sinkron.createDocument(docId, colId, Automerge.save(makeDoc()))

        // has permission
        const res = await sinkron.checkCollectionPermission({
            id: colId,
            user,
            action: Action.read
        })
        assert(res.isOk)
        assert.strictEqual(res.value, true)

        const res2 = await sinkron.checkDocumentPermission({
            id: docId,
            user,
            action: Action.update
        })
        assert(res2.isOk)
        assert.strictEqual(res2.value, true)

        // no permission
        const res3 = await sinkron.checkCollectionPermission({
            id: colId,
            user: user2,
            action: Action.read
        })
        assert(res3.isOk)
        assert.strictEqual(res3.value, false)

        const res4 = await sinkron.checkDocumentPermission({
            id: docId,
            user: user2,
            action: Action.update
        })
        assert(res4.isOk)
        assert.strictEqual(res4.value, false)

        // update permissions
        await sinkron.updateDocumentPermissions(docId, (p) => {
            p.add(Action.update, Role.user(user2))
        })
        await sinkron.updateCollectionPermissions(colId, (p) => {
            p.add(Action.read, Role.user(user2))
        })

        const res5 = await sinkron.checkCollectionPermission({
            id: colId,
            user: user2,
            action: Action.read
        })
        assert(res5.isOk)
        assert.strictEqual(res5.value, true)

        const res6 = await sinkron.checkDocumentPermission({
            id: docId,
            user: user2,
            action: Action.update
        })
        assert(res6.isOk)
        assert.strictEqual(res6.value, true)
    })

    it("refs", async () => {
        const colId = uuidv4()
        await sinkron.createCollection({
            id: colId,
            permissions: emptyPermissionsTable()
        })

        const refColId = uuidv4()
        const res = await sinkron.createCollection({
            id: refColId,
            permissions: emptyPermissionsTable(),
            ref: true
        })
        assert(res.isOk, "res")

        const id = uuidv4()
        const doc = makeDoc()
        const res2 = await sinkron.createDocument(
            id,
            colId,
            Automerge.save(doc)
        )
        assert(res2.isOk, "res2")

        const res3 = await sinkron.addDocumentToCollection(refColId, id)
        assert(res3.isOk, "res3")

        // already added
        const res4 = await sinkron.addDocumentToCollection(refColId, id)
        assert(!res4.isOk, "res4")

        const res5 = await sinkron.syncCollection(refColId)
        assert(res5.isOk, "res5")
        assert.strictEqual(res5.value.documents?.[0]?.id, id)

        const res6 = await sinkron.removeDocumentFromCollection(refColId, id)
        assert(res6.isOk, "res6")

        const res7 = await sinkron.syncCollection(refColId)
        assert(res7.isOk, "res7")
        assert.strictEqual(res7.value.documents?.length, 0)
        assert(res7.value.colrev > res5.value.colrev)
    })
})
