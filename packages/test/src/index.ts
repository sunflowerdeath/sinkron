import WebSocket from "ws"
import { createNanoEvents } from "nanoevents"
import { v4 as uuid } from "uuid"
import { LoroDoc } from "loro-crdt"
import { Base64 } from "js-base64"

export type ResultType<T, E = Error> =
    | { isOk: true; value: T }
    | { isOk: false; error: E }

const Result = {
    ok: <T, E>(value: T): ResultType<T, E> => ({ isOk: true, value }),
    err: <T, E>(error: E): ResultType<T, E> => ({ isOk: false, error })
}

enum ErrorCode {
    AuthFailed = "auth_dailed",
    BadRequest = "bad_request",
    NotFound = "not_found",
    Forbidden = "forbidden",
    UnprocessableContent = "unprocessable_content",
    InternalServerError = "internal_server_error"
}

type SinkronError = { code: ErrorCode, message: string }

type Collection = {
    id: string,
    is_ref: boolean,
    colrev: string
}

type Document = {
    id: string,
    col: string,
    colrev: string
}

// export { Result }

type SinkronClientProps = {
    url: string
    token: string
}

class SinkronClient {
    constructor() {}

    // Collections

    async createCollection(
        id: string,
        permissions: Permissions
    ): Promise<ResultType<Collection, SinkronError>> {}

    async getCollection(
        id: string
    ): Promise<ResultType<Collection, SinkronError>> {}

    async deleteCollection(
        id: string
    ): Promise<ResultType<void, SinkronError>> {}

    // Documents

    async createDocument(
        id: string,
        col: string,
        data: object
    ): Promise<ResultType<void, SinkronError>> {}

    async getDocument(
        id: string,
        col: string,
        data: object
    ): Promise<ResultType<void, SinkronError>> {}

    async updateDocumentWithCallback<T>(
        id: string,
        col: string,
        cb: (doc: LoroDoc<T>) => void
    ): Promise<ResultType<Document, SinkronError>> {}

    async deleteDocument(
        id: string,
        col: string
    ): Promise<ResultType<void, SinkronError>> {}

    // Groups

    async createGroup(
        user: string,
        group: string
    ): Promise<ResultType<void, SinkronError>> {}
    async addUserToGroup(
        user: string,
        group: string
    ): Promise<ResultType<void, SinkronError>> {}
    async removeUserFromGroup(
        group: string,
        user: string
    ): Promise<ResultType<void, SinkronError>> {}
    async removeUserFromAllGroups(
        user: string
    ): Promise<ResultType<void, SinkronError>> {}

    // Permissions

    // async updateCollectionPermission
}

export interface Transport {
    open(): void
    close(): void
    send(msg: string): void
    emitter: ReturnType<typeof createNanoEvents>
}

export type WebSocketTransportProps = {
    url: string
    webSocketImpl?: typeof WebSocket
}

class WebSocketTransport implements Transport {
    constructor(props: WebSocketTransportProps) {
        const { url, webSocketImpl } = props
        this.url = url
        // @ts-ignore
        this.webSocketImpl = webSocketImpl || global.WebSocket
    }

    emitter = createNanoEvents()
    url: string
    webSocketImpl: typeof WebSocket
    ws?: WebSocket

    open() {
        console.log("Connecting to websocket:", this.url)
        this.ws = new this.webSocketImpl(this.url)
        this.ws.addEventListener("open", () => {
            console.log("Connected to websocket!")
            this.emitter.emit("open")
        })
        this.ws.addEventListener("message", (event) => {
            this.emitter.emit("message", event.data)
        })
        this.ws.addEventListener("close", () => {
            this.emitter.emit("close")
            console.log("Websocket connection closed.")
            this.ws = undefined
        })
        this.ws.addEventListener("error", (err) => {
            console.log("Websocket connection error:", err)
            this.ws?.close()
        })
    }

    close() {
        this.ws?.close()
    }

    send(msg: string) {
        if (this.ws && this.ws.readyState === 1 /* open */) {
            this.ws.send(msg)
        } else {
            throw new Error("Couldn't send message: connection is closed")
        }
    }
}

let sleep = (time: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, time)
    })

let start = async () => {
    let res = await fetch("http://localhost:3000/create_collection", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({ id: "test", is_ref: false, permissions: "test" })
    })
    if (res.ok) {
        let json = await res.json()
        console.log("Collection created", json)
    } else {
        console.log("Error", await res.text())
    }

    let res2 = await fetch("http://localhost:3000/get_collection", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({ id: "test" })
    })
    if (res2.ok) {
        let json = await res2.json()
        console.log("Get collection", json)
    } else {
        console.log("Error", await res2.text())
    }

    const id = uuid()
    const doc = new LoroDoc()
    doc.getText("text").insert(0, "Hello")
    const snapshot = doc.export({ mode: "snapshot" })
    console.log("SNAPSHOT", snapshot.length)
    let res3 = await fetch("http://localhost:3000/create_document", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({
            id,
            col: "test",
            data: Base64.fromUint8Array(snapshot)
        })
    })
    if (res3.ok) {
        let json = await res3.json()
        console.log("Create document", json)
        let created = new LoroDoc()
        created.import(Base64.toUint8Array(json.data))
        console.log("Created doc content:", created.toJSON())
    } else {
        console.log("Error", await res3.text())
    }

    await sleep(10)

    const version = doc.version()
    doc.getText("text").insert(5, ", world!")
    const update = doc.export({ mode: "update", from: version })
    let res4 = await fetch("http://localhost:3000/update_document", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({
            id,
            col: "test",
            data: Base64.fromUint8Array(update)
        })
    })
    if (res4.ok) {
        let json = await res4.json()
        console.log("Update document", json)
        let updated = new LoroDoc()
        updated.import(Base64.toUint8Array(json.data))
        console.log("Updated doc content:", updated.toJSON())
    } else {
        console.log("Error", await res4.text())
    }

    let res5 = await fetch("http://localhost:3000/delete_document", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({
            id,
            col: "test"
        })
    })
    if (res5.ok) {
        let json = await res5.json()
        console.log("Deleted document", json)
    } else {
        console.log("Error", await res5.text())
    }
}

const test_ws = () => {
    const transport = new WebSocketTransport({
        url: "ws://localhost:3000/sync?col=test&colrev=123",
        webSocketImpl: WebSocket
    })

    transport.emitter.on("message", (msg) => {
        console.log("message", msg)
    })

    transport.emitter.on("close", (msg) => {
        console.log("close", msg)
    })

    transport.emitter.on("open", () => {
        transport.send("test")
    })

    transport.open()
}

// start()
test_ws()
