import { IncomingMessage } from "node:http"
import { Duplex } from "node:stream"

import Ajv, { JSONSchemaType } from "ajv"
import { WebSocketServer, WebSocket } from "ws"
import pino, { Logger } from "pino"

import { Document } from "./entities"
import { Sinkron, RequestError } from "./core"
import { Result, ResultType } from "./result"
import { Action } from "./permissions"
import {
    ErrorCode,
    SyncMessage,
    SyncErrorMessage,
    SyncCompleteMessage,
    Op,
    ChangeMessage,
    ModifyMessage,
    CreateMessage,
    DeleteMessage,
    ErrorMessage,
    DocMessage,
    ClientMessage
} from "./protocol"
import { MessageQueue, WsMessage } from "./messageQueue"

const enableProfiling = process.env.ENABLE_PROFILING === "1"

const syncMessageSchema = {
    type: "object",
    properties: {
        kind: { const: "sync" },
        // token: { type: 'string' },
        col: { type: "string" },
        colrev: { type: "integer" }
    },
    required: ["kind", "col"],
    additionalProperties: false
}

const changeMessageSchema = {
    type: "object",
    properties: {
        kind: { const: "change" },
        col: { type: "string" },
        id: { type: "string" },
        changeid: { type: "string" },
        op: { type: "string" },
        data: {
            oneOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } }
            ]
        }
    },
    required: ["kind", "col", "id", "changeid", "op"],
    additionalProperties: false,
    oneOf: [
        {
            properties: {
                op: { const: Op.Create },
                data: { type: "string" }
            },
            required: ["data"]
        },
        {
            properties: {
                op: { const: Op.Modify },
                data: { type: "array", items: { type: "string" } }
            },
            required: ["data"]
        },
        {
            properties: {
                op: { const: Op.Delete }
            }
        }
    ]
}

const clientMessageSchema = {
    oneOf: [syncMessageSchema, changeMessageSchema]
}

const createValidator = () => {
    const ajv = new Ajv()
    const validate = ajv.compile(clientMessageSchema)
    return validate
}

const validateMessage = createValidator()

const serializeDate = (d: Date) => d.toISOString()

const clientDisconnectTimeout = 10000

interface SinkronServerOptions {
    sinkron: Sinkron
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
}

const initialProfilerSegment = () => ({
    start: performance.now(),
    handledMessages: 0,
    handlerDuration: 0,
    sentMessages: 0
})

class SinkronServer {
    sinkron: Sinkron
    ws: WebSocketServer

    clients = new Map<WebSocket, { subscriptions: Set<string>; id: string }>()
    collections = new Map<string, { subscribers: Set<WebSocket> }>()

    logger: Logger<string>
    messageQueue: MessageQueue

    profile?: ProfilerSegment

    constructor(options: SinkronServerOptions) {
        const { sinkron, host, port, logger } = {
            ...defaultServerOptions,
            ...options
        }

        this.logger = logger === undefined ? defaultLogger() : logger
        this.sinkron = sinkron

        if (enableProfiling) {
            this.profile = initialProfilerSegment()
        }

        this.messageQueue = new MessageQueue(async (msg: WsMessage) => {
            try {
                let now
                if (this.profile) {
                    now = performance.now()
                }
                await this.handleMessage(msg)
                if (this.profile) {
                    const duration = performance.now() - now!
                    this.profile.handledMessages += 1
                    this.profile.handlerDuration += duration
                }
            } catch (e) {
                this.logger.error(
                    "Unhandled exception while handling message, %o",
                    e
                )
            }
        })

        this.ws = new WebSocketServer({ noServer: true })
        this.ws.on("connection", this.onConnect.bind(this))
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
        request: IncomingMessage,
        client: { id: string }
    ) {
        this.logger.debug("Client connected, id: " + client.id)
        this.clients.set(ws, { subscriptions: new Set(), id: client.id })
        setTimeout(() => {
            const client = this.clients.get(ws)
            if (client === undefined) return
            if (client.subscriptions.size === 0) ws.close()
        }, clientDisconnectTimeout)
        ws.on("message", (msg: Buffer) => this.messageQueue.push([ws, msg]))
        ws.on("close", () => this.onDisconnect(ws))
    }

    async handleMessage([ws, msg]: WsMessage) {
        const str = msg.toString("utf-8")

        let parsed: ClientMessage
        try {
            parsed = JSON.parse(str.toString())
        } catch (e) {
            this.logger.debug("Invalid JSON in message")
            return
        }

        this.logger.trace("Message recieved: %o", parsed)

        const isValid = validateMessage(parsed)
        if (!isValid) {
            // TODO react something
            this.logger.debug(
                "Invalid message schema: %o",
                validateMessage.errors
            )
            return
        }

        if (parsed.kind === "sync") {
            await this.handleSyncMessage(ws, parsed)
        } else {
            // parsed.kind === "change"
            await this.handleChangeMessage(parsed, ws)
        }
    }

    async handleSyncMessage(ws: WebSocket, msg: SyncMessage) {
        const { col, colrev } = msg

        // TODO error if second sync message

        const client = this.clients.get(ws)
        if (!client) return
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

        this.addSubscriber(msg.col, ws)
        this.logger.debug("Client subscribed to collection %s", msg.col)
    }

    async handleChangeMessage(msg: ChangeMessage, ws: WebSocket) {
        const { op, col } = msg

        let res: ResultType<Document, RequestError>
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
            return
        }
        const doc = res.value
        this.logger.debug("Change applied, id: %s, op: %s", msg.id, msg.op)

        const collection = this.collections.get(col)
        if (collection) {
            const { colrev, updatedAt, createdAt } = doc!
            const response: ChangeMessage = { ...msg, colrev }
            response.updatedAt = serializeDate(updatedAt)
            if (msg.op === Op.Create) {
                response.createdAt = serializeDate(createdAt)
            }
            collection.subscribers.forEach((sub) => {
                sub.send(JSON.stringify(response))
                if (this.profile) this.profile.sentMessages += 1
            })
        }
    }

    async handleCreateMessage(
        msg: CreateMessage,
        ws: WebSocket
    ): Promise<ResultType<Document, RequestError>> {
        const { id, col, changeid, data } = msg

        const client = this.clients.get(ws)
        if (!client) return Result.err({ code: ErrorCode.InternalServerError })
        const checkRes = await this.sinkron.checkCollectionPermission({
            id: col,
            user: client.id,
            action: Action.create
        })
        if (!checkRes.isOk || !checkRes.value === true) {
            return Result.err({ code: ErrorCode.AccessDenied })
        }

        return await this.sinkron.createDocument(
            id!,
            col,
            Buffer.from(data, "base64")
        )
    }

    async handleDeleteMessage(
        msg: DeleteMessage,
        ws: WebSocket
    ): Promise<ResultType<Document, RequestError>> {
        const { col, id, changeid } = msg

        const client = this.clients.get(ws)
        if (!client) return Result.err({ code: ErrorCode.InternalServerError })
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
    ): Promise<ResultType<Document, RequestError>> {
        const { id, changeid, col, data } = msg

        const client = this.clients.get(ws)
        if (!client) return Result.err({ code: ErrorCode.InternalServerError })
        const checkRes = await this.sinkron.checkDocumentPermission({
            id,
            user: client.id,
            action: Action.update
        })
        if (!checkRes.isOk || !checkRes.value === true) {
            return Result.err({ code: ErrorCode.AccessDenied })
        }

        const doc = await this.sinkron.updateDocument(
            id,
            data.map((c) => Buffer.from(c, "base64"))
        )
        return doc
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

    addSubscriber(col: string, ws: WebSocket) {
        const client = this.clients.get(ws)!

        client.subscriptions.add(col)

        const collection = this.collections.get(col)
        if (collection) {
            collection.subscribers.add(ws)
        } else {
            this.collections.set(col, { subscribers: new Set([ws]) })
        }
    }

    report() {
        if (!this.profile) return {}
        const { start, handledMessages, handlerDuration, sentMessages } =
            this.profile
        const res = {
            time: performance.now() - start,
            clients: this.clients.size,
            handledMessages,
            duration: handlerDuration / handledMessages,
            sentMessages
        }
        this.profile = initialProfilerSegment()
        return res
    }
}

export { SinkronServer }
