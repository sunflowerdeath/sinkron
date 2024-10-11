import { IncomingMessage } from "node:http"
import { Duplex } from "node:stream"

import Ajv from "ajv"
import { WebSocketServer, WebSocket } from "ws"
import pino, { Logger } from "pino"

import { Sinkron, RequestError, DocumentView } from "./core"
import { Result, ResultType } from "./result"
import { Action } from "./permissions"
import {
    ErrorCode,
    HeartbeatMessage,
    SyncMessage,
    SyncErrorMessage,
    Op,
    ChangeMessage,
    ModifyMessage,
    CreateMessage,
    DeleteMessage,
    ErrorMessage,
    DocMessage,
    GetMessage,
    ClientMessage
} from "./protocol"
import { MessageQueue, SequentialMessageQueue, WsMessage } from "./messageQueue"
import { clientMessageSchema } from "./schema"

const enableProfiling = process.env.ENABLE_PROFILING === "1"

const createValidator = () => {
    const ajv = new Ajv()
    const validate = ajv.compile(clientMessageSchema)
    return validate
}

const validateMessage = createValidator()

const serializeDate = (d: Date) => d.toISOString()

const ns = 1e9

// Time for considering client as inactive. It should be higher that heartbeat
// interval on client (30s)
const inactiveDisconnectTimeout = BigInt(60 * ns) // 60s

// How often to perform check for inactive clients
const checkAliveInterval = 60000 // 60s

// Disconnecting idle client that doesnt subscribe to anything
// TODO fix it
const clientDisconnectTimeout = 10000

interface SinkronServerOptions {
    sinkron: Sinkron
    sync?: boolean
    logger?: Logger<string>
    host?: string
    port?: number
}

const defaultServerOptions = {
    host: "127.0.0.1",
    port: 8080
}

const defaultLogger = (level = "debug"): Logger<string> => {
    const logger: Logger<string> = pino({
        transport: { target: "pino-pretty" }
    })
    logger.level = level
    return logger
}

type ProfilerSegment = {
    start: number
    handledMessages: number
    handlerDuration: number
    sentMessages: number
    failedMessages: number
}

const initialProfilerSegment = () => ({
    start: performance.now(),
    handledMessages: 0,
    handlerDuration: 0,
    sentMessages: 0,
    failedMessages: 0
})

type Client = {
    id: string
    subscriptions: Set<string>
}

class SinkronServer {
    sinkron: Sinkron
    ws: WebSocketServer
    clients = new Map<WebSocket, Client>()
    collections = new Map<string, { subscribers: Set<WebSocket> }>()
    queue?: MessageQueue<WsMessage>
    logger: Logger<string>
    profile?: ProfilerSegment
    checkAliveTimeout?: ReturnType<typeof setTimeout>
    dispose: () => void

    constructor(options: SinkronServerOptions) {
        const { sinkron, logger, sync } = {
            ...defaultServerOptions,
            ...options
        }

        this.logger = logger === undefined ? defaultLogger() : logger
        this.sinkron = sinkron

        if (enableProfiling) {
            this.profile = initialProfilerSegment()
        }

        if (sync) {
            this.queue = new SequentialMessageQueue(this.onMessage.bind(this))
        }

        this.ws = new WebSocketServer({ noServer: true })
        this.ws.on("connection", this.onConnect.bind(this))

        this.checkAliveTimeout = setTimeout(
            () => this.checkAlive(),
            checkAliveInterval
        )
        this.dispose = () => clearInterval(this.checkAliveTimeout)
    }

    checkAlive() {
        const now = process.hrtime.bigint()
        this.ws.clients.forEach((ws) => {
            // @ts-ignore
            const lastActive: bigint = ws.lastActive
            if (now - lastActive > inactiveDisconnectTimeout) {
                const inactive = (now - lastActive) / BigInt(ns)
                console.log(
                    `terminated inactive client, inactive for ${inactive}`
                )
                ws.terminate()
            }
        })
        this.checkAliveTimeout = setTimeout(
            () => this.checkAlive(),
            checkAliveInterval
        )
    }

    upgrade(
        request: IncomingMessage,
        socket: Duplex,
        head: Buffer,
        client: object
    ) {
        this.ws.handleUpgrade(request, socket, head, (ws) => {
            this.ws.emit("connection", ws, request, client)
        })
    }

    async onConnect(
        ws: WebSocket,
        _request: IncomingMessage,
        client: { id: string }
    ) {
        this.logger.debug("Client connected, id: " + client.id)
        this.clients.set(ws, {
            subscriptions: new Set(),
            id: client.id
        })
        setTimeout(() => {
            const client = this.clients.get(ws)
            if (client === undefined) return
            if (client.subscriptions.size === 0) {
                ws.close()
            }
        }, clientDisconnectTimeout)

        if (this.queue) {
            ws.on("message", (msg: Buffer) => {
                this.queue!.push([ws, msg])
            })
        } else {
            ws.on("message", (msg: Buffer) => {
                this.onMessage([ws, msg])
            })
        }

        // @ts-ignore
        ws.lastActive = process.hrtime.bigint()

        ws.on("close", () => this.onDisconnect(ws))
    }

    async onMessage([ws, msg]: WsMessage) {
        try {
            let now
            if (this.profile) {
                now = performance.now()
            }
            await this.handleMessage(ws, msg)
            if (this.profile) {
                const duration = performance.now() - now!
                this.profile.handledMessages += 1
                this.profile.handlerDuration += duration
            }
        } catch (e) {
            if (this.profile) this.profile.failedMessages += 1
            this.logger.error("Unhandled exception while handling message")
            this.logger.error(
                "%o, %s",
                e,
                typeof e === "object" && e !== null && "message" in e
                    ? e.message
                    : ""
            )
        }
    }

    async handleMessage(ws: WebSocket, msg: Buffer) {
        let parsed: ClientMessage
        try {
            parsed = JSON.parse(msg.toString("utf-8"))
        } catch {
            this.logger.debug("Invalid JSON in message")
            if (this.profile) this.profile.failedMessages += 1
            return
        }

        // this.logger.trace("Message recieved: %o", parsed)

        const isValid = validateMessage(parsed)
        if (!isValid) {
            this.logger.debug(
                "Invalid message schema: %o",
                validateMessage.errors
            )
            if (this.profile) this.profile.failedMessages += 1
            return
        }

        if (parsed.kind === "h") {
            this.handleHeartbeatMessage(ws, parsed)
        } else if (parsed.kind === "sync") {
            await this.handleSyncMessage(ws, parsed)
        } else if (parsed.kind === "change") {
            await this.handleChangeMessage(parsed, ws)
        } else if (parsed.kind === "get") {
            await this.handleGetMessage(ws, parsed)
        }
    }

    handleHeartbeatMessage(ws: WebSocket, msg: HeartbeatMessage) {
        // @ts-ignore
        ws.lastActive = process.hrtime.bigint()
        const reply = { kind: "h", i: msg.i + 1 }
        ws.send(JSON.stringify(reply))
    }

    async handleGetMessage(ws: WebSocket, msg: GetMessage) {
        const { id } = msg

        const client = this.clients.get(ws)
        if (!client) return

        const checkRes = await this.sinkron.checkDocumentPermission({
            id,
            user: client.id,
            action: Action.read
        })
        if (!checkRes.isOk || !checkRes.value) {
            // TODO access denied
            return
        }

        const doc = await this.sinkron.getDocument(id)
        if (doc === null) {
            // doc not found
            return
        }

        const response: DocMessage = {
            kind: "doc",
            id,
            // @ts-ignore
            data: doc.data ? doc.data.toString("base64") : null,
            createdAt: serializeDate(doc.createdAt),
            updatedAt: serializeDate(doc.updatedAt)
        }
        ws.send(JSON.stringify(response))
    }

    async handleSyncMessage(ws: WebSocket, msg: SyncMessage) {
        const { col, colrev } = msg

        const client = this.clients.get(ws)
        if (!client) return

        // TODO error if second sync message

        const checkRes = await this.sinkron.checkCollectionPermission({
            id: col,
            user: client.id,
            action: Action.read
        })
        if (!checkRes.isOk || !checkRes.value === true) {
            const errorMsg: SyncErrorMessage = {
                kind: "sync_error",
                col,
                code: ErrorCode.AccessDenied
            }
            ws.send(JSON.stringify(errorMsg))
            return
        }

        const result = await this.sinkron.syncCollection(col, colrev)
        if (!result.isOk) {
            const errorMsg: SyncErrorMessage = {
                kind: "sync_error",
                col,
                code: result.error.code
            }
            ws.send(JSON.stringify(errorMsg))
            if (this.profile) this.profile.sentMessages += 1
            return
        }

        result.value.documents.forEach((doc) => {
            const msg: DocMessage = {
                kind: "doc",
                col,
                id: doc.id,
                // @ts-ignore
                data: doc.data ? doc.data.toString("base64") : null,
                createdAt: serializeDate(doc.createdAt),
                updatedAt: serializeDate(doc.updatedAt)
            }
            ws.send(JSON.stringify(msg))
            if (this.profile) this.profile.sentMessages += 1
        })

        const syncCompleteMsg = {
            kind: "sync_complete",
            col,
            colrev: result.value.colrev
        }
        ws.send(JSON.stringify(syncCompleteMsg))
        if (this.profile) this.profile.sentMessages += 1

        const subscribed = this.addSubscriber(col, ws)
        if (subscribed) {
            this.logger.debug("Client subscribed to collection %s", msg.col)
        }
    }

    async handleChangeMessage(msg: ChangeMessage, ws: WebSocket) {
        const { op, col } = msg

        let res: ResultType<DocumentView, RequestError>
        if (op === Op.Create) {
            res = await this.handleCreateMessage(msg, ws)
        } else if (op === Op.Delete) {
            res = await this.handleDeleteMessage(msg, ws)
        } else {
            // if (op === Op.Modify)
            res = await this.handleModifyMessage(msg, ws)
        }
        if (!res.isOk) {
            this.logger.debug(
                "Failed to apply change, id: %s, error: %s, %s",
                msg.id,
                res.error.code,
                res.error.details
            )
            const errorMsg: ErrorMessage = {
                kind: "error",
                id: msg.id,
                changeid: msg.changeid,
                code: res.error.code
            }
            ws.send(JSON.stringify(errorMsg))
            if (this.profile) this.profile.failedMessages += 1
            return
        }
        const doc = res.value
        // this.logger.trace("Change applied, id: %s, op: %s", msg.id, msg.op)

        const collection = this.collections.get(col)
        if (collection) {
            const { colrev, updatedAt, createdAt } = doc
            const response: ChangeMessage = { ...msg, colrev }
            response.updatedAt = serializeDate(updatedAt)
            if (msg.op === Op.Create) {
                response.createdAt = serializeDate(createdAt)
            }
            const reponseMsg = JSON.stringify(response)
            collection.subscribers.forEach((ws) => {
                ws.send(reponseMsg)
                if (this.profile) this.profile.sentMessages += 1
            })
        }
    }

    async handleCreateMessage(
        msg: CreateMessage,
        ws: WebSocket
    ): Promise<ResultType<DocumentView, RequestError>> {
        const { id, col, data } = msg

        const client = this.clients.get(ws)
        if (!client) {
            return Result.err({
                code: ErrorCode.InternalServerError,
                details: "Client not found"
            })
        }
        const checkRes = await this.sinkron.checkCollectionPermission({
            id: col,
            user: client.id,
            action: Action.create
        })
        if (!checkRes.isOk || !checkRes.value === true) {
            return Result.err({ code: ErrorCode.AccessDenied })
        }

        return await this.sinkron.createDocument(
            id,
            col,
            Buffer.from(data, "base64")
        )
    }

    async handleDeleteMessage(
        msg: DeleteMessage,
        ws: WebSocket
    ): Promise<ResultType<DocumentView, RequestError>> {
        const { col, id } = msg

        const client = this.clients.get(ws)
        if (!client) {
            return Result.err({
                code: ErrorCode.InternalServerError,
                details: "Client not found"
            })
        }
        const checkRes = await this.sinkron.checkCollectionPermission({
            id: col,
            user: client.id,
            action: Action.delete
        })
        if (!checkRes.isOk || !checkRes.value === true) {
            return Result.err({ code: ErrorCode.AccessDenied })
        }

        // TODO send col or check permissions on document
        return await this.sinkron.deleteDocument(id)
    }

    async handleModifyMessage(
        msg: ModifyMessage,
        ws: WebSocket
    ): Promise<ResultType<DocumentView, RequestError>> {
        const { id, data } = msg

        const client = this.clients.get(ws)
        if (!client) {
            return Result.err({
                code: ErrorCode.InternalServerError,
                details: "Client not found"
            })
        }

        const checkRes = await this.sinkron.checkDocumentPermission({
            id,
            user: client.id,
            action: Action.update
        })
        if (!checkRes.isOk || !checkRes.value) {
            return Result.err({ code: ErrorCode.AccessDenied })
        }

        return await this.sinkron.updateDocument(
            id,
            data.map((c) => Buffer.from(c, "base64"))
        )
    }

    onDisconnect(ws: WebSocket) {
        this.logger.debug("Client disconnected")
        const client = this.clients.get(ws)
        if (client) {
            client.subscriptions.forEach((col) => {
                const collection = this.collections.get(col)
                if (collection) collection.subscribers.delete(ws)
            })
        }
        this.clients.delete(ws)
    }

    addSubscriber(col: string, ws: WebSocket): boolean {
        const client = this.clients.get(ws)

        if (!client) return false

        client.subscriptions.add(col)
        const collection = this.collections.get(col)
        if (collection) {
            collection.subscribers.add(ws)
        } else {
            this.collections.set(col, { subscribers: new Set([ws]) })
        }
        return true
    }

    report() {
        if (!this.profile) return {}
        const {
            start,
            handledMessages,
            handlerDuration,
            sentMessages,
            failedMessages
        } = this.profile
        const res = {
            time: performance.now() - start,
            clients: this.clients.size,
            handledMessages,
            duration: handlerDuration / handledMessages,
            sentMessages,
            failedMessages
        }
        this.profile = initialProfilerSegment()
        return res
    }

    async updateDocumentWithCallback<T>(
        id: string,
        cb: (val: T) => void
    ): Promise<ResultType<true, RequestError>> {
        const res = await this.sinkron.updateDocumentWithCallback(id, cb)
        if (!res.isOk) return res

        const { doc, changes } = res.value
        const collection = this.collections.get(doc.col)
        if (collection) {
            const { col, colrev, updatedAt } = doc
            const msg: ChangeMessage = {
                kind: "change",
                op: Op.Modify,
                id,
                // @ts-ignore
                data: changes.map((c) => Buffer.from(c).toString("base64")),
                col,
                colrev,
                updatedAt: serializeDate(updatedAt),
                changeid: ""
            }
            const reponseMsg = JSON.stringify(msg)
            collection.subscribers.forEach((ws) => {
                ws.send(reponseMsg)
                if (this.profile) this.profile.sentMessages += 1
            })
        }

        return Result.ok(true)
    }
}

export { SinkronServer }
