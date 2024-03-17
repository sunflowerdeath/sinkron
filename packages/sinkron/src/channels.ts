import { WebSocketServer, WebSocket } from "ws"
import pino from "pino"

import { MessageQueue, WsMessage } from "./messageQueue"

const pingInterval = 30000

interface ChannelServerProps {
    logger?: ReturnType<typeof pino>
}

class ChannelServer {
    logger?: ReturnType<typeof pino>
    ws: WebSocketServer
    messageQueue: MessageQueue
    clients = new Map<WebSocket, { channels: Set<string> }>()
    channels = new Map<string, { subscribers: Set<WebSocket> }>()
    dispose: () => void

    constructor(props: ChannelServerProps) {
        const { logger } = props

        this.logger = logger
        this.ws = new WebSocketServer({ noServer: true })
        this.ws.on("connection", this.onConnect.bind(this))

        this.messageQueue = new MessageQueue(async (msg: WsMessage) => {
            try {
                await this.handleMessage(msg)
            } catch (e) {
                this.logger?.error(
                    "Unhandled exception while handling message, %o",
                    e
                )
            }
        })

        const timeout = setInterval(() => {
            // TODO handle many clients?
            this.ws.clients.forEach((ws) => {
                // @ts-ignore
                if (ws.isAlive === false) return ws.terminate()
                // @ts-ignore
                ws.isAlive = false
                ws.ping()
            })
        }, pingInterval)
        this.dispose = () => clearInterval(timeout)
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
        ws.on("message", (msg: Buffer) => this.messageQueue.push([ws, msg]))
        ws.on("close", () => this.onDisconnect(ws))
    }

    handleMessage([ws, msg]: WsMessage) {
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
