import { LoroDoc } from "loro-crdt"
import {
    makeObservable,
    observable,
    action,
    computed,
    createAtom,
    IAtom,
} from "mobx"
import pino, { Logger } from "pino"

import { AutoReconnect } from "./autoReconnect"
import { Heartbeat } from "./heartbeat"
import type { ServerMessage, ClientMessage } from "./protocol"
import { Transport, WebSocketTransport } from "./transport"

const L = LoroDoc.prototype

class ObservableLoroDoc {
    #doc: LoroDoc
    #atom: IAtom

    constructor(doc: LoroDoc | undefined) {
        this.#doc = doc === undefined ? new LoroDoc() : doc
        this.#atom = createAtom("ObservableLoroDoc")
    }

    get doc() {
        this.#atom.reportObserved()
        return this.#doc
    }

    change(cb: (doc: LoroDoc) => void) {
        cb(this.#doc)
        this.#atom.reportChanged()
    }

    export(...args: Parameters<typeof L.export>): ReturnType<typeof L.export> {
        this.#atom.reportObserved()
        return this.#doc.export(...args)
    }

    fork(...args: Parameters<typeof L.fork>): ObservableLoroDoc {
        this.#atom.reportObserved()
        return new ObservableLoroDoc(this.#doc.fork(...args))
    }

    import(...args: Parameters<typeof L.import>): ReturnType<typeof L.import> {
        const res = this.#doc.import(...args)
        this.#atom.reportChanged()
        return res
    }

    toJSON(...args: Parameters<typeof L.toJSON>): ReturnType<typeof L.toJSON> {
        this.#atom.reportObserved()
        return this.#doc.toJSON(...args)
    }

    version(
        ...args: Parameters<typeof L.version>
    ): ReturnType<typeof L.version> {
        this.#atom.reportObserved()
        return this.#doc.version(...args)
    }
}

export enum ItemState {
    Changed = 1,
    ChangesSent = 2,
    Synchronized = 3,
    Error = 4,
}

interface ItemInitialValues {
    id: string
    remote: ObservableLoroDoc | null
    local: ObservableLoroDoc | null
    state: ItemState
    localUpdatedAt?: Date
    createdAt?: Date
    updatedAt?: Date
}

export type ExtractData<T> = (doc: LoroDoc) => T

export class Item<T> {
    id!: string
    // Remote version of the document. It is `null` until server acknowledges
    // creation.
    remote!: ObservableLoroDoc | null
    // Local version of the document. After deleting it remains in the
    // collection with `null` value until server acknowledges deletion.
    local!: ObservableLoroDoc | null
    state!: ItemState
    // Used to sort items in when they are not in synchronized state
    localUpdatedAt?: Date = undefined
    createdAt?: Date = undefined
    updatedAt?: Date = undefined

    extractData?: ExtractData<T> | undefined

    get data() {
        if (this.local === null) {
            return undefined
        } else {
            return this.extractData?.(this.local.doc)
        }
    }

    constructor(
        initialValues: ItemInitialValues,
        extractData: ExtractData<T> | undefined = undefined,
    ) {
        Object.assign(this, initialValues)
        this.extractData = extractData
        makeObservable(this, {
            remote: observable.ref,
            local: observable.ref,
            state: observable,
            createdAt: observable.ref,
            updatedAt: observable.ref,
            localUpdatedAt: observable.ref,
            data: computed,
        })
    }
}

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
    dataExtractor?: ExtractData<T>
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

class SinkronClient {
    logger: Logger<string>

    next_channel_index = 1
    collections: { [key: string]: SinkronCollection<any> } = {}

    transport: Transport
    status: ConnectionStatus = ConnectionStatus.Disconnected
    heartbeat?: Heartbeat
    autoReconnect?: AutoReconnect
    disconnect?: () => void

    constructor(props: SinkronClientProps) {
        const { store, errorHandler, logger } = props
        // this.store = store
        // this.errorHandler = errorHandler
        this.logger = logger === undefined ? defaultLogger() : logger
        makeObservable(this, {
            status: observable,
        })
        this.init(props)
    }

    init(props: SinkronClientProps) {
        const { url, authToken, webSocketImpl } = props

        this.transport = new WebSocketTransport({
            url,
            webSocketImpl,
            logger: this.logger,
        })

        this.transport.emitter.on("open", this.onConnect)
        this.transport.emitter.on("close", this.onDisconnect)
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

    collection<T>(props: SinkronCollectionProps<T>): SinkronCollection<T> {
        let channel = this.next_channel_index
        this.next_channel_index += 1
        const collection = new SinkronCollection(this, channel, props)
        this.collections[channel] = collection
        if (this.status === ConnectionStatus.Connected) {
            collection.onConnect()
        }
        return collection
    }

    onConnect() {
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

        for (const col of Object.values(this.collections)) {
            col.onConnect()
        }
    }

    onDisconnect() {
        this.logger.info("Connection closed")
        this.status = ConnectionStatus.Disconnected

        this.heartbeat?.dispose()
        this.heartbeat = undefined

        for (const col of Object.values(this.collections)) {
            col.onDisconnect()
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
            let col = this.collections[channel]
            col?.handleMessage(message)
        }
    }
}

class SinkronCollection<T> {
    client: SinkronClient
    channel: number

    constructor(
        client: SinkronClient,
        channel: number,
        props: SinkronCollectionProps<T>,
    ) {
        this.client = client
        this.channel = channel
    }

    onConnect() {
        // send sync_start
    }

    onDisconnect() {}

    handleMessage(msg: ServerMessage) {}

    sendMessage(message: ClientMessage) {
        this.client.send(this.channel, message)
    }

    dispose() {
        // send sync_stop
    }
}

export { SinkronClient }
