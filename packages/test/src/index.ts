import WebSocket from "ws"
import { createNanoEvents } from "nanoevents"

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

const transport = new WebSocketTransport({
    url: "ws://localhost:3000/sync?col=test&colrev=123",
    webSocketImpl: WebSocket
});

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
