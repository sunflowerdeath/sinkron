import { WebSocket } from "ws"
import pino from "pino"

type WebSocketWithLastActive = WebSocket & { lastActive: bigint }

const ns = 1e9

// Period after which the client is considered inactive and can be disconnected
// (Client should send heartbeat messages every 30 seconds)
const DISCONNECT_TIMEOUT = 60 * ns // 60s

// Interval between checking for inactive clients
const INACTIVE_CHECK_INTERVAL = 60000 // 60s

const now = () => process.hrtime.bigint()

interface ChannelServerProps {
    logger?: ReturnType<typeof pino>
}

class ChannelServer {
    logger?: ReturnType<typeof pino>
    clients = new Map<WebSocket, { channels: Set<string> }>()
    channels = new Map<string, { subscribers: Set<WebSocket> }>()
    inactiveCheckTimeout?: ReturnType<typeof setTimeout>
    dispose: () => void

    constructor(props: ChannelServerProps) {
        const { logger } = props

        this.logger = logger

        this.inactiveCheckTimeout = setTimeout(
            () => this.disconnectInactiveClients(),
            INACTIVE_CHECK_INTERVAL
        )
        this.dispose = () => clearInterval(this.inactiveCheckTimeout)
    }

    disconnectInactiveClients() {
        const anow = now()
        this.clients.forEach((_client, _ws) => {
            const ws = _ws as WebSocketWithLastActive
            if (anow - ws.lastActive > DISCONNECT_TIMEOUT) {
                this.logger?.debug(
                    "Client disconnected for being inactive too long"
                )
                ws.terminate()
            }
        })
        this.inactiveCheckTimeout = setTimeout(
            () => this.disconnectInactiveClients(),
            INACTIVE_CHECK_INTERVAL
        )
    }

    async onConnect(_ws: WebSocket, chan: string) {
        const ws = _ws as WebSocketWithLastActive

        this.clients.set(ws, { channels: new Set([chan]) })
        const channel = this.channels.get(chan)
        if (channel) {
            channel.subscribers.add(ws)
        } else {
            this.channels.set(chan, { subscribers: new Set([ws]) })
        }

        ws.lastActive = now()
        ws.on("message", async (msg: Buffer) => {
            try {
                this.handleMessage(ws, msg)
            } catch (e) {
                this.logger?.debug("Error in Channel handler %o", e)
            }
        })
        ws.on("close", () => this.onDisconnect(ws))

        this.logger?.debug("Client subscribed to channel %s", chan)
    }

    handleMessage(ws: WebSocketWithLastActive, msg: Buffer) {
        const str = msg.toString("utf-8")
        const match = str.match(/^heartbeat:(\d+)$/)
        if (match !== null) {
            ws.lastActive = now()
            const next = Number(match[1]) + 1
            ws.send(`heartbeat:${next}`)
        }
    }

    onDisconnect(ws: WebSocket) {
        this.logger?.debug("Client disconnected")
        const client = this.clients.get(ws)
        if (client) {
            client.channels.forEach((chan) => {
                this.channels.get(chan)?.subscribers.delete(ws)
            })
        }
        this.clients.delete(ws)
    }

    send(chan: string, message: string) {
        const channel = this.channels.get(chan)
        if (channel) channel.subscribers.forEach((ws) => ws.send(message))
    }
}

export { ChannelServer }
