import { action } from "mobx"

export interface CollectionStore {
    save(id: string, item: Item<any>): Promise<void>
    delete(id: string): Promise<void>
    colrev(colrev: string): Promise<void>
    load(): Promise<{ items: StoredItem[]; colrev: string }>
    dispose(): void
}

interface SinkronClientProps {
    url: string
    authToken: string
    store?: CollectionStore
    noAutoReconnect?: boolean
    errorHandler?: (msg: ServerMessage) => void
    logger?: Logger<string>
    webSocketImpl?: typeof WebSocket
}

interface SinkronCollectionProps<T> {
    col: string
    errorHandler?: (msg: ServerMessage) => void
    dataExtractor?: DataExtractor<T>
}

type ChannelId = number

class SinkronClient {
    next_channel_index = 1
    channels: Map<ChannelId, SinkronCollection> = new Map()

    transport: Transport

    constructor(props: SinkronClientProps) {}

    collection(props: SinkronCollectionProps): SinkronCollection {
        let channel = this.next_channel_index
        this.next_channel_index += 1
        return new SinkronCollection(this, channel, props)
    }

    init() {
        this.transport.emitter.on(
            "open",
            action(() => {
                this.logger.info("Connection established")
                this.status = ConnectionStatus.Connected
                this.heartbeat = new Heartbeat({
                    logger: this.logger,
                    heartbeat: (i: number) => {
                        this.logger.trace(`Sending heartbeat: ${i}`, i)
                        const heartbeat = { kind: "h", i }
                        this.transport.send(JSON.stringify(heartbeat))
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

                // TODO send to collection that connection is open
            }),
        )
        this.transport.emitter.on(
            "close",
            action(() => {
                this.logger.info("Connection closed")
                this.status = ConnectionStatus.Disconnected
                this.heartbeat?.dispose()
                this.heartbeat = undefined
                // TODO send disconnect message to collections
                // this.flushDebounced.cancel()
            }),
        )
        this.transport.emitter.on("message", (msg: string) => {
            try {
                this.handleMessage(msg)
            } catch (e) {
                this.logger.error(
                    "Unhandled exception in message handler, %o",
                    e,
                )
            }
        })

        if (props.noAutoReconnect) {
            this.transport.open()
            this.disconnect = () => this.transport.close()
        } else {
            this.autoReconnect = new AutoReconnect({
                connect: () => this.transport.open()
            })
            this.transport.emitter.on("open", () =>
                this.autoReconnect?.onOpen()
            )
            this.transport.emitter.on("close", () =>
                this.autoReconnect?.onClose()
            )
            this.disconnect = () => {
                this.autoReconnect?.stop()
                this.transport.close()
            }
        }
    }

    handleMessage(msg: string) {
        // parse channel & message
        // if 0 channel
        // if other channel
        let { channel, message } = parseMessage(msg)

        if (channel === 0) {
            // handle heartbeat, connection error
        } else {
            let col = this.channels.get(channel)
            col?.handleMessage(message)
        }
    }
}

class SinkronCollection {
    client: SinkronClient
    channel: ChannelId

    constructor(
        client: SinkronClient,
        channel: ChannelId,
        props: SinkronCollectionProps,
    ) {
        this.client = client
        this.channel = channel
    }

    handleMessage(msg: ServerMessage) {
    }

    sendMessage(message: ClientMessage) {
        this.client.send(this.channel, message)
    }
}

export { SinkronClient }
