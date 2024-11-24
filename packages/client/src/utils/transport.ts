import { Logger } from "pino"
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
    logger?: Logger<string>
}

class WebSocketTransport implements Transport {
    constructor(props: WebSocketTransportProps) {
        const { url, webSocketImpl, logger } = props
        this.url = url
        this.webSocketImpl = webSocketImpl || global.WebSocket
        this.logger = logger
    }

    emitter = createNanoEvents()
    url: string
    webSocketImpl: typeof WebSocket
    ws?: WebSocket
    logger?: Logger<string>

    open() {
        this.logger?.debug("Connecting to websocket: %s", this.url)
        this.ws = new this.webSocketImpl(this.url)
        this.ws.addEventListener("open", () => {
            this.logger?.debug("Websocket connection open")
            this.emitter.emit("open")
        })
        this.ws.addEventListener("message", (event) => {
            this.emitter.emit("message", event.data)
        })
        this.ws.addEventListener("close", () => {
            this.logger?.debug("Websocket connection close")
            this.emitter.emit("close")
            this.ws = undefined
        })
        this.ws.addEventListener("error", (err) => {
            this.logger?.debug("Websocket connection error: %o", err)
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

export { WebSocketTransport }
