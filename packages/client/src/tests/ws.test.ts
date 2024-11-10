import { inspect } from "node:util"
import assert from "node:assert"
import { isMatch } from "lodash"
import { Base64 } from "js-base64"

import { v4 as uuidv4 } from "uuid"
import { LoroDoc } from "loro-crdt"

import { SinkronApi, ErrorCode } from "../index"
import { Permissions } from "../permissions"
import { WebSocketTransport } from "../ws"
import { ServerMessage, ClientMessage, Op } from "../protocol"

let apiUrl = "http://localhost:3000"
let apiToken = "SINKRON_API_TOKEN"
let wsUrl = (col: string, colrev: string) =>
    `ws://localhost:3000/sync?col=${col}&colrev=${colrev}`

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
        let waiter = this.waiters.shift()
        if (waiter) {
            waiter(e)
        } else {
            this.events.push(e)
        }
    }

    async next(): Promise<WsEvent> {
        let event = this.events.shift()
        if (event) return event
        return new Promise((resolve) => {
            this.waiters.push(resolve)
        })
    }

    send(msg: ClientMessage) {
        this.ws.send(JSON.stringify(msg))
    }
}

const assertIsMatch = (a: object, b: object) => {
    const match = isMatch(a, b)
    if (!match) {
        assert.fail(
            "Expected objects to match: \n" +
                `Given: ${inspect(a)}\n` +
                `Expected: ${inspect(b)}`
        )
    }
}

const testDoc = () => {
    let doc = new LoroDoc()
    doc.getText("test").insert(0, "Hello")
    return doc.export({ mode: "snapshot" })
}

describe.only("Sinkron", () => {
    it("connect", async () => {
        let col = uuidv4()

        let api = new SinkronApi({ url: apiUrl, token: apiToken })
        let permissions = new Permissions()
        let createRes = await api.createCollection({ id: col, permissions })
        assert(createRes.isOk, "create col")

        // invalid col
        {
            let invalid_col = uuidv4()
            let ws = new WsTest(wsUrl(invalid_col, "0"))
            let e1 = await ws.next()
            assert.strictEqual(e1.kind, "open")
            let e2 = await ws.next()
            assert.deepEqual(e2, {
                kind: "message",
                data: {
                    kind: "sync_error",
                    col: invalid_col,
                    code: "not_found"
                }
            })
        }

        // invalid colrev
        {
            let ws = new WsTest(wsUrl(col, "1234"))
            let e1 = await ws.next()
            assert.strictEqual(e1.kind, "open")
            let e2 = await ws.next()
            assert.deepEqual(e2, {
                kind: "message",
                data: {
                    kind: "sync_error",
                    col,
                    code: "unprocessable_content"
                }
            })
        }

        // valid
        {
            let ws = new WsTest(wsUrl(col, "0"))
            let e1 = await ws.next()
            assert.strictEqual(e1.kind, "open")
            let e2 = await ws.next()
            assert.strictEqual(e2.kind, "message")
            assert.strictEqual(e2.data.kind, "sync_complete")
        }
    })

    it("sync", async () => {
        let col = uuidv4()

        let api = new SinkronApi({ url: apiUrl, token: apiToken })
        let permissions = new Permissions()
        let createRes = await api.createCollection({ id: col, permissions })
        assert(createRes.isOk, "create col")

        const createDoc1Res = await api.createDocument({
            col,
            id: uuidv4(),
            data: testDoc()
        })
        assert(createDoc1Res.isOk, "create doc 1")
        const doc1 = createDoc1Res.value

        const createDoc2Res = await api.createDocument({
            col,
            id: uuidv4(),
            data: testDoc()
        })
        assert(createDoc2Res.isOk, "create doc 2")
        const doc2 = createDoc2Res.value
        const deleteDoc2Res = await api.deleteDocument({
            col,
            id: doc2.id
        })
        assert(deleteDoc2Res.isOk, "delete doc 2")
        const doc2deleted = deleteDoc2Res.value

        // sync without colrev
        {
            let ws = new WsTest(wsUrl(col, "0"))
            let e1 = await ws.next()
            assert.strictEqual(e1.kind, "open")
            let e2 = await ws.next()
            assertIsMatch(e2, {
                kind: "message",
                data: { kind: "doc", id: doc1.id }
            })
            let e3 = await ws.next()
            assertIsMatch(e3, {
                kind: "message",
                data: { kind: "sync_complete", col, colrev: doc2deleted.colrev }
            })
        }

        // sync (with colrev)
        {
            let ws = new WsTest(wsUrl(col, doc2.colrev))
            let e1 = await ws.next()
            assert.strictEqual(e1.kind, "open")
            let e2 = await ws.next()
            assertIsMatch(e2, {
                kind: "message",
                data: { kind: "doc", col, id: doc2.id, data: null }
            })
            let e3 = await ws.next()
            assertIsMatch(e3, {
                kind: "message",
                data: { kind: "sync_complete", col, colrev: doc2deleted.colrev }
            })
        }
    })

    it("crud", async () => {
        let col = uuidv4()

        let api = new SinkronApi({ url: apiUrl, token: apiToken })
        let permissions = new Permissions()
        let createRes = await api.createCollection({ id: col, permissions })
        assert(createRes.isOk, "create col")

        let ws = new WsTest(wsUrl(col, "0"))
        let events = [await ws.next(), await ws.next()]
        assertIsMatch(events, [
            { kind: "open" },
            { kind: "message", data: { kind: "sync_complete" } }
        ])

        // create
        const id = uuidv4()
        let doc = new LoroDoc()
        doc.getText("test").insert(0, "Hello")
        let data = Base64.fromUint8Array(doc.export({ mode: "snapshot" }))
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
    })

    // change error
 
    // get
    // get_error
})
