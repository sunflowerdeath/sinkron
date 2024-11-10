import { inspect } from "node:util"
import assert from "node:assert"
import { isMatch } from "lodash"

import { v4 as uuidv4 } from "uuid"
import { LoroDoc } from "loro-crdt"

import { SinkronApi, ErrorCode } from "../index"
import { Permissions } from "../permissions"
import { WebSocketTransport } from "../ws"
import { ServerMessage } from "../protocol"

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

        const createDocRes1 = await api.createDocument({
            col,
            id: uuidv4(),
            data: testDoc()
        })
        assert(createDocRes1.isOk, "create doc 1")
        const createDocRes2 = await api.createDocument({
            col,
            id: uuidv4(),
            data: testDoc()
        })
        assert(createDocRes2.isOk, "create doc 2")

        const doc1 = createDocRes1.value
        const doc2 = createDocRes2.value

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
                data: { kind: "doc", id: doc2.id }
            })
            let e4 = await ws.next()
            assertIsMatch(e4, {
                kind: "message",
                data: { kind: "sync_complete", col, colrev: doc2.colrev }
            })
        }
        // sync (without colrev)
        // sync (with colrev)
        // sync_error (invalid_colrev)
    })

    // create
    // update
    // delete

    // change error

    // get
    // get_error
})
