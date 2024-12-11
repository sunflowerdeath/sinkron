import assert from "node:assert"
import { Base64 } from "js-base64"

import { v4 as uuidv4 } from "uuid"
import { LoroDoc } from "loro-crdt"

import { SinkronClient, Permissions, Action, role } from "../client"
import { ServerMessage, ClientMessage, Op } from "../protocol"

import { assertIsMatch } from "./utils"

const apiUrl = "http://localhost:3000"
const apiToken = "SINKRON_API_TOKEN"
const syncToken = "token-test"
const wsUrl = (col: string, colrev: string, token: string) =>
    `ws://localhost:3000/sync?col=${col}&colrev=${colrev}&token=${token}`

type WsEvent =
    | { kind: "open" }
    | { kind: "close" }
    | { kind: "error"; error: any }
    | { kind: "message"; data: ServerMessage }

class WsTest {
    ws: WebSocket
    events: WsEvent[] = []
    waiters: Array<(e: WsEvent) => void> = []

    constructor(url: string) {
        this.ws = new WebSocket(url)
        this.ws.addEventListener("open", () => {
            this.push({ kind: "open" })
        })
        this.ws.addEventListener("message", (event) => {
            this.push({ kind: "message", data: JSON.parse(event.data) })
        })
        this.ws.addEventListener("close", () => {
            this.push({ kind: "close" })
        })
        this.ws.addEventListener("error", (error) => {
            this.push({ kind: "error", error })
        })
    }

    push(e: WsEvent) {
        const waiter = this.waiters.shift()
        if (waiter) {
            waiter(e)
        } else {
            this.events.push(e)
        }
    }

    async next(): Promise<WsEvent> {
        const event = this.events.shift()
        if (event) return event
        return new Promise((resolve) => {
            this.waiters.push(resolve)
        })
    }

    send(msg: ClientMessage) {
        this.ws.send(JSON.stringify(msg))
    }
}

const testDoc = () => {
    const doc = new LoroDoc()
    doc.getText("test").insert(0, "Hello")
    return doc.export({ mode: "snapshot" })
}

describe("Sinkron", () => {
    it("connect", async () => {
        const col = uuidv4()

        const sinkron = new SinkronClient({ url: apiUrl, token: apiToken })
        const permissions = Permissions.any()
        const createRes = await sinkron.createCollection({
            id: col,
            permissions
        })
        assert(createRes.isOk, "create col")

        // invalid auth token
        {
            const ws = new WsTest(wsUrl(col, "0", "invalid"))
            const e1 = await ws.next()
            assert.strictEqual(e1.kind, "open")
            const e2 = await ws.next()
            assert.deepEqual(e2, {
                kind: "message",
                data: { kind: "sync_error", col, code: "auth_failed" }
            })
            ws.ws.close()
        }

        // invalid col
        {
            const invalid_col = uuidv4()
            const ws = new WsTest(wsUrl(invalid_col, "0", syncToken))
            const e1 = await ws.next()
            assert.strictEqual(e1.kind, "open")
            const e2 = await ws.next()
            assert.deepEqual(e2, {
                kind: "message",
                data: {
                    kind: "sync_error",
                    col: invalid_col,
                    code: "not_found"
                }
            })
            ws.ws.close()
        }

        // invalid colrev
        {
            const ws = new WsTest(wsUrl(col, "1234", syncToken))
            const e1 = await ws.next()
            assert.strictEqual(e1.kind, "open")
            const e2 = await ws.next()
            assert.deepEqual(e2, {
                kind: "message",
                data: {
                    kind: "sync_error",
                    col,
                    code: "unprocessable_content"
                }
            })
            ws.ws.close()
        }

        // valid
        {
            const ws = new WsTest(wsUrl(col, "0", syncToken))
            const e1 = await ws.next()
            assert.strictEqual(e1.kind, "open")
            const e2 = await ws.next()
            assert.strictEqual(e2.kind, "message")
            assert.strictEqual(e2.data.kind, "sync_complete")
            ws.ws.close()
        }
    })

    it("sync", async () => {
        const col = uuidv4()

        const sinkron = new SinkronClient({ url: apiUrl, token: apiToken })
        const permissions = Permissions.any()
        const createRes = await sinkron.createCollection({
            id: col,
            permissions
        })
        assert(createRes.isOk, "create col")

        const createDoc1Res = await sinkron.createDocument({
            col,
            id: uuidv4(),
            data: testDoc()
        })
        assert(createDoc1Res.isOk, "create doc 1")
        const doc1 = createDoc1Res.value

        const createDoc2Res = await sinkron.createDocument({
            col,
            id: uuidv4(),
            data: testDoc()
        })
        assert(createDoc2Res.isOk, "create doc 2")
        const doc2 = createDoc2Res.value
        const deleteDoc2Res = await sinkron.deleteDocument({
            col,
            id: doc2.id
        })
        assert(deleteDoc2Res.isOk, "delete doc 2")
        const doc2deleted = deleteDoc2Res.value

        // sync without colrev
        {
            const ws = new WsTest(wsUrl(col, "0", syncToken))
            const e1 = await ws.next()
            assert.strictEqual(e1.kind, "open")
            const e2 = await ws.next()
            assertIsMatch(e2, {
                kind: "message",
                data: { kind: "doc", id: doc1.id }
            })
            const e3 = await ws.next()
            assertIsMatch(e3, {
                kind: "message",
                data: { kind: "sync_complete", col, colrev: doc2deleted.colrev }
            })
            ws.ws.close()
        }

        // sync (with colrev)
        {
            const ws = new WsTest(wsUrl(col, doc2.colrev, syncToken))
            const e1 = await ws.next()
            assert.strictEqual(e1.kind, "open")
            const e2 = await ws.next()
            assertIsMatch(e2, {
                kind: "message",
                data: { kind: "doc", col, id: doc2.id, data: null }
            })
            const e3 = await ws.next()
            assertIsMatch(e3, {
                kind: "message",
                data: { kind: "sync_complete", col, colrev: doc2deleted.colrev }
            })
            ws.ws.close()
        }
    })

    it("crud", async () => {
        const col = uuidv4()

        const sinkron = new SinkronClient({ url: apiUrl, token: apiToken })
        const permissions = Permissions.any()
        const createRes = await sinkron.createCollection({
            id: col,
            permissions
        })
        assert(createRes.isOk, "create col")

        const ws = new WsTest(wsUrl(col, "0", syncToken))
        const events = [await ws.next(), await ws.next()]
        assertIsMatch(events, [
            { kind: "open" },
            { kind: "message", data: { kind: "sync_complete" } }
        ])

        // create
        const id = uuidv4()
        const doc = new LoroDoc()
        doc.getText("test").insert(0, "Hello")
        const data = Base64.fromUint8Array(doc.export({ mode: "snapshot" }))
        ws.send({
            kind: "change",
            id,
            changeid: uuidv4(),
            col,
            op: Op.Create,
            data
        })
        const createEvent = await ws.next()
        assertIsMatch(createEvent, {
            kind: "message",
            data: { kind: "change", id, col, op: Op.Create }
        })

        // get
        ws.send({ kind: "get", id, col })
        const getEvent = await ws.next()
        assertIsMatch(getEvent, {
            kind: "message",
            data: { kind: "doc", id, col }
        })

        // get error
        const invalidId = uuidv4()
        ws.send({ kind: "get", id: invalidId, col })
        const getErrEvent = await ws.next()
        assertIsMatch(getErrEvent, {
            kind: "message",
            data: { kind: "get_error", id: invalidId, code: "not_found" }
        })

        // update
        const v = doc.version()
        doc.getText("test").insert(5, ", world")
        const updateData = Base64.fromUint8Array(
            doc.export({ mode: "update", from: v })
        )
        ws.send({
            kind: "change",
            id,
            changeid: uuidv4(),
            col,
            op: Op.Update,
            data: updateData
        })
        const updateEvent = await ws.next()
        assertIsMatch(updateEvent, {
            kind: "message",
            data: { kind: "change", id, col, op: Op.Update }
        })

        // delete
        ws.send({
            kind: "change",
            id,
            changeid: uuidv4(),
            col,
            op: Op.Delete,
            data: null
        })
        const deleteEvent = await ws.next()
        assertIsMatch(deleteEvent, {
            kind: "message",
            data: { kind: "change", id, col, op: Op.Delete }
        })

        ws.ws.close()
    })

    it("permissions", async () => {
        const sinkron = new SinkronClient({ url: apiUrl, token: apiToken })

        const PERMITTED = "permitted"
        const READONLY = "readonly"
        const FORBIDDEN = "forbidden"

        const permissions = Permissions.empty()
        permissions.add(Action.read, role.user(`user-${PERMITTED}`))
        permissions.add(Action.read, role.user(`user-${READONLY}`))
        permissions.add(Action.create, role.user(`user-${PERMITTED}`))
        permissions.add(Action.update, role.user(`user-${PERMITTED}`))
        permissions.add(Action.delete, role.user(`user-${PERMITTED}`))

        const col = uuidv4()
        await sinkron.createCollection({ id: col, permissions })

        const docId = uuidv4()

        // forbidden
        const wsForbidden = new WsTest(wsUrl(col, "0", `token-${FORBIDDEN}`))
        const eventsForbidden = [
            await wsForbidden.next(),
            await wsForbidden.next()
        ]
        assertIsMatch(eventsForbidden, [
            { kind: "open" },
            { kind: "message", data: { kind: "sync_error", code: "forbidden" } }
        ])
        wsForbidden.ws.close()

        // readonly
        const wsReadonly = new WsTest(wsUrl(col, "0", `token-${READONLY}`))
        const eventsReadonly = [
            await wsReadonly.next(),
            await wsReadonly.next()
        ]
        assertIsMatch(eventsReadonly, [
            { kind: "open" },
            { kind: "message", data: { kind: "sync_complete" } }
        ])
        wsReadonly.send({
            kind: "change",
            id: docId,
            changeid: uuidv4(),
            col,
            op: Op.Create,
            data: Base64.fromUint8Array(testDoc())
        })
        assertIsMatch(await wsReadonly.next(), {
            kind: "message",
            data: { kind: "change_error", code: "forbidden" }
        })
        wsReadonly.ws.close()

        // permitted
        const wsPermitted = new WsTest(wsUrl(col, "0", `token-${PERMITTED}`))
        const eventsPermitted = [
            await wsPermitted.next(),
            await wsPermitted.next()
        ]
        assertIsMatch(eventsPermitted, [
            { kind: "open" },
            { kind: "message", data: { kind: "sync_complete" } }
        ])
        wsPermitted.send({
            kind: "change",
            id: docId,
            changeid: uuidv4(),
            col,
            op: Op.Create,
            data: Base64.fromUint8Array(testDoc())
        })
        assertIsMatch(await wsPermitted.next(), {
            kind: "message",
            data: { kind: "change" }
        })
        wsPermitted.ws.close()

        // update permissions
        const upd1res = await sinkron.updateCollectionPermissionsWithCallback({
            id: col,
            cb: (p) => {
                p.add(Action.update, role.user(`user-${READONLY}`))
            }
        })
        assert(upd1res.isOk, "updateCollectionPermissions")
        const upd2res = await sinkron.updateDocumentPermissionsWithCallback({
            id: docId,
            col,
            cb: (p) => {
                p.add(Action.update, role.user(`user-${READONLY}`))
            }
        })
        assert(upd2res.isOk, "updateDocumentPermissions")
    })
})
