import { makeObservable, observable, action } from "mobx"
import pino, { Logger } from "pino"

import { type ExtractData, SinkronCollection } from "./collection"
import type { CollectionStore } from "./collectionStore"
import { FileApi } from "./fileApi"
import { Heartbeat } from "./heartbeat"
import type { ServerMessage, ClientMessage, HeartbeatMessage } from "./protocol"
import { Transport, WebSocketTransport } from "./transport"
import { UploadQueue } from "./uploadQueue"
import { AutoReconnect } from "./utils/autoReconnect"

type SinkronClientProps = {
    wsUrl: string
    apiUrl: string
    authToken: string
    store?: (col: string) => CollectionStore
    noAutoReconnect?: boolean
    errorHandler?: (msg: ServerMessage) => void
    logger?: Logger<string>
    webSocketImpl?: typeof WebSocket
}

type SinkronCollectionProps<T> = {
    col: string
    errorHandler?: (msg: ServerMessage) => void
    extractData?: ExtractData<T>
}

export enum ConnectionStatus {
    Disconnected = "disconnected",
    Connected = "connected",
    Ready = "ready",
    Error = "error",
}

const defaultLogger = (level = "debug"): Logger<string> => {
    const logger: Logger<string> = pino({
        transport: { target: "pino-pretty" },
    })
    logger.level = level
    return logger
}

const parseMessage = <T>(
    msg: string,
): { message: T; channel: number } | null => {
    const match = msg.match(/^(\d{1,6}):(.*)$/)
    if (!match) return null
    const channel = parseInt(match[1], 10)
    const rest = match[2]
    try {
        const parsed = JSON.parse(rest)
        return { channel, message: parsed }
    } catch {
        return null
    }
}

class SinkronClient {
    fileApi: FileApi
    uploadQueue: UploadQueue
    logger: Logger<string>
    clientLogger: Logger<string>
    store?: (col: string) => CollectionStore
    errorHandler?: (msg: ServerMessage) => void
    next_channel_index = 1
    collections: { [key: string]: SinkronCollection<any> } = {}
    transport: Transport
    status: ConnectionStatus = ConnectionStatus.Disconnected
    heartbeat?: Heartbeat
    autoReconnect?: AutoReconnect
    disconnect?: () => void
    isDestroyed: boolean = false

    constructor(props: SinkronClientProps) {
        const {
            store,
            errorHandler,
            logger,
            wsUrl,
            apiUrl,
            authToken,
            webSocketImpl,
        } = props

        this.logger = logger === undefined ? defaultLogger() : logger
        this.clientLogger = this.logger.child({}, { msgPrefix: "[Client] " })

        this.fileApi = new FileApi({ url: apiUrl, authToken })
        this.uploadQueue = new UploadQueue(this.fileApi)

        this.store = store
        this.errorHandler = errorHandler

        makeObservable(this, {
            status: observable,
            onConnect: action,
            onDisconnect: action,
            isDestroyed: observable,
        })

        this.transport = new WebSocketTransport({
            url: `${wsUrl}?token=${authToken}`,
            webSocketImpl,
            logger: this.logger.child(
                {},
                { msgPrefix: "[WebSocketTransport] " },
            ),
        })
        this.transport.emitter.on("open", () => this.onConnect())
        this.transport.emitter.on("close", () => this.onDisconnect())
        this.transport.emitter.on("message", (msg: string) => {
            try {
                this.handleMessage(msg)
            } catch (e) {
                this.clientLogger.error(
                    { error: e },
                    "Unhandled exception in message handler",
                )
            }
        })

        if (props.noAutoReconnect) {
            this.transport.open()
            this.disconnect = () => this.transport.close()
        } else {
            this.autoReconnect = new AutoReconnect({
                connect: () => this.transport.open(),
            })
            this.transport.emitter.on("open", () =>
                this.autoReconnect?.onOpen(),
            )
            this.transport.emitter.on("close", () =>
                this.autoReconnect?.onClose(),
            )
            this.disconnect = () => {
                this.autoReconnect?.stop()
                this.transport.close()
            }
        }
    }

    destroy() {
        this.isDestroyed = true
        for (const collection of Object.values(this.collections)) {
            collection.dispose()
        }
        this.disconnect?.()
        this.heartbeat?.dispose()
    }

    collection<T>(props: SinkronCollectionProps<T>): SinkronCollection<T> {
        if (this.isDestroyed) {
            throw new Error(
                "Couldn't create collection. Client is already destroyed",
            )
        }

        const channel = this.next_channel_index
        this.next_channel_index += 1
        const collection = new SinkronCollection({
            client: this,
            channel,
            store: this.store ? this.store(props.col) : undefined,
            logger: this.logger.child(
                { col: props.col },
                { msgPrefix: "[Collection] " },
            ),
            ...props,
        })
        this.collections[channel] = collection
        if (this.status === ConnectionStatus.Connected) {
            collection.onConnect()
        }
        this.clientLogger.info(
            { channel, col: props.col },
            "Opened new collection channel",
        )
        return collection
    }

    onConnect() {
        this.clientLogger.info("Connection established")
        this.status = ConnectionStatus.Connected
        this.uploadQueue.start()
        this.heartbeat = new Heartbeat({
            logger: this.clientLogger,
            heartbeat: (i: number) => {
                this.logger.trace({ heartbeat: i }, "Sending heartbeat")
                const heartbeat: HeartbeatMessage = { kind: "h", i }
                this.send(0, heartbeat)
            },
            heartbeatInterval: 30000,
            timeout: 5000,
            onTimeout: () => {
                this.logger.warn(
                    "No response from server for too long, disconnecting",
                )
                this.transport.close()
            },
        })
        for (const col of Object.values(this.collections)) {
            col.onConnect()
        }
    }

    onDisconnect() {
        this.clientLogger.info("Connection closed")
        this.status = ConnectionStatus.Disconnected
        this.uploadQueue.stop()
        this.heartbeat?.dispose()
        this.heartbeat = undefined
        for (const col of Object.values(this.collections)) {
            col.onDisconnect()
        }
    }

    handleMessage(msg: string) {
        this.clientLogger.trace({ msg }, "Received message")
        const parsed = parseMessage<ServerMessage>(msg)
        if (parsed === null) {
            this.clientLogger.error({ msg }, "Couldn't parse message")
            return
        }
        const { channel, message } = parsed

        if (channel === 0) {
            this.handleSystemMessage(message)
        } else {
            const col = this.collections[channel]
            if (col) {
                col.handleMessage(message)
            } else {
                this.clientLogger.warn(
                    { channel },
                    "Received message in the closed channel",
                )
                if ("col" in message) {
                    this.send(channel, { kind: "sync_stop", col: message.col })
                }
            }
        }
    }

    handleSystemMessage(msg: ServerMessage) {
        if (msg.kind === "h") {
            this.clientLogger.trace("Recieved hearbeat response")
            this.heartbeat?.handleHeartbeatResponse(msg.i)
        } else if (msg.kind === "connection_error") {
            this.clientLogger.warn(
                { code: msg.code },
                "Received connection error, disconnecting",
            )
            this.disconnect?.()
            this.errorHandler?.(msg)
        }
    }

    send(channel: number, msg: ClientMessage) {
        this.transport.send(String(channel) + ":" + JSON.stringify(msg))
    }

    closeChannel(channel: number) {
        this.clientLogger.info({ channel }, "Closing channel")
        delete this.collections[channel]
    }
}

export { SinkronClient }
