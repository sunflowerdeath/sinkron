import assert from "node:assert"

import { v4 as uuidv4 } from "uuid"
import { LoroDoc } from "loro-crdt"

import { SinkronApi, ErrorCode } from "../index"
import { Permissions } from "../permissions"
import { WebSocketTransport } from "../ws"

let apiUrl = "http://localhost:3000"
let apiToken = "SINKRON_API_TOKEN"
let wsUrl = (col: string, colrev: string) =>
    `ws://localhost:3000/sync?col=${col}&colrev=${colrev}`

type WsEvent =
    | { kind: "open" }
    | { kind: "close" }
    | { kind: "error"; error: any }
    | { kind: "message"; data: string }

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
            console.log("MESSAGE")
            this.push({ kind: "message", data: event.data })
        })
        this.ws.addEventListener("close", () => {
            console.log("CLOSE")
            this.push({ kind: "close" })
        })
        this.ws.addEventListener("error", (error) => {
            console.log("ERROR")
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

describe.only("Sinkron", () => {
    it("connect", async () => {
        let col = uuidv4()

        let api = new SinkronApi({ url: apiUrl, token: apiToken })
        let permissions = new Permissions()
        let createRes = await api.createCollection({ id: col, permissions })
        assert(createRes.isOk, "create col")

        let ws = new WsTest(wsUrl(col, "0"))

        let e1 = await ws.next()
        assert.strictEqual(e1.kind, "open")

        let e2 = await ws.next()
        assert.strictEqual(e2.kind, "message")
        console.log(e2.data)

        // connect to webscoket (with transport)

        // create
        // update
        // delete

        // change error

        // get
        // get_error
    })

    it("sync", async () => {
        // create collection
        // create 2 documens
        // sync (without colrev)
        // sync (with colrev)
        // sync_error (invalid_colrev)
    })
})
