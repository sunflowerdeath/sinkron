import { Logger, pino } from "pino"

import { Transport, WebSocketTransport } from "./utils/transport"
import { AutoReconnect } from "./utils/autoReconnect"
import { Heartbeat } from "./utils/heartbeat"

const defaultLogger = (level = "debug"): Logger<string> => {
    const logger: Logger<string> = pino({
        transport: { target: "pino-pretty" }
    })
    logger.level = level
    return logger
}

export interface ChannelProps {
    logger?: Logger<string>
    url: string
    handler: (msg: string) => void
}

class Channel {
    transport: Transport
    autoReconnect: AutoReconnect
    heartbeat?: Heartbeat
    dispose: () => void
    logger: Logger<string>

    constructor(props: ChannelProps) {
        const { url, handler, logger } = props
        this.logger = logger === undefined ? defaultLogger() : logger
        this.transport = new WebSocketTransport({ url, logger: this.logger })
        this.transport.emitter.on("open", () => {
            this.autoReconnect.onOpen()
            this.heartbeat = new Heartbeat({
                logger,
                heartbeat: (i) => this.transport.send(`heartbeat:${i}`),
                heartbeatInterval: 30000,
                timeout: 5000,
                onTimeout: () => this.transport.close()
            })
        })
        this.transport.emitter.on("message", (msg: string) => {
            const match = msg.match(/^heartbeat:(\d+)$/)
            if (match !== null) {
                const i = Number(match[1])
                this.heartbeat?.handleHeartbeatResponse(i)
            } else {
                this.logger.debug(`Received message in channel: ${msg}`)
                handler(msg)
            }
        })
        this.transport.emitter.on("close", () => {
            this.autoReconnect.onClose()
            this.heartbeat?.dispose()
            this.heartbeat = undefined
        })
        this.autoReconnect = new AutoReconnect({
            connect: () => this.transport.open()
        })
        this.dispose = () => {
            this.autoReconnect.stop()
            this.heartbeat?.dispose()
            this.transport.close()
        }
    }
}

export { Channel }
