import { WebSocketServer, WebSocket } from "ws"
import pino from "pino"

const pingInterval = 30000

interface ChannelServerProps {
    logger?: ReturnType<typeof pino>
}

class ChannelServer {
    logger?: ReturnType<typeof pino>
    ws: WebSocketServer
    clients = new Map<WebSocket, { channels: Set<string> }>()
    channels = new Map<string, { subscribers: Set<WebSocket> }>()
    timeout?: ReturnType<typeof setTimeout>
    dispose: () => void

    constructor(props: ChannelServerProps) {
        const { logger } = props

        this.logger = logger
        this.ws = new WebSocketServer({ noServer: true })
        this.ws.on("connection", this.onConnect.bind(this))

        this.timeout = setTimeout(() => this.ping(), pingInterval)
        this.dispose = () => clearInterval(this.timeout)
    }

    ping() {
        this.ws.clients.forEach((ws) => {
            // @ts-ignore
            if (ws.isAlive === false) return ws.terminate()
            // @ts-ignore
            ws.isAlive = false
            ws.ping()
        })
        this.timeout = setTimeout(() => this.ping(), pingInterval)
    }

    async onConnect(ws: WebSocket) {
        this.logger?.debug("Client connected")
        this.clients.set(ws, { channels: new Set() })
        // @ts-ignore
        ws.isAlive = true
        ws.on("pong", () => {
            // @ts-ignore
            ws.isAlive = true
        })
        ws.on("message", async (msg: Buffer) => {
            try {
                await this.handleMessage(ws, msg)
            } catch (e) {
                this.logger?.error(
                    "Unhandled exception while handling message, %o",
                    e
                )
            }
        })
        ws.on("close", () => this.onDisconnect(ws))
    }

    handleMessage(ws: WebSocket, msg: Buffer) {
        const str = msg.toString("utf-8")
        const match = str.match(/^subscribe:(.+)$/)
        if (match) this.addSubscriber(ws, match[1])
    }

    addSubscriber(ws: WebSocket, channame: string) {
        const client = this.clients.get(ws)
        if (!client) return

        // TODO authorize

        this.logger?.debug("Client subscribed to channel %s", channame)
        client.channels.add(channame)
        const channel = this.channels.get(channame)
        if (channel) {
            channel.subscribers.add(ws)
        } else {
            this.channels.set(channame, { subscribers: new Set([ws]) })
        }
    }

    onDisconnect(ws: WebSocket) {
        this.logger?.debug("Client disconnected")
        const client = this.clients.get(ws)
        if (client) {
            client.channels.forEach((channame) => {
                this.channels.get(channame)?.subscribers.delete(ws)
            })
        }
        this.clients.delete(ws)
    }

    send(channame: string, message: string) {
        const channel = this.channels.get(channame)
        if (channel) channel.subscribers.forEach((ws) => ws.send(message))
    }
}

export { ChannelServer }
