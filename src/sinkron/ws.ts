import Ajv, { JSONSchemaType } from 'ajv'
import { WebSocketServer, WebSocket } from 'ws'

import { Document } from "./entities"
import { Sinkron, RequestError } from "./sinkron"
import pino from 'pino'

import { Result, ResultType } from "./result"
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
} from './protocol'

const syncMessageSchema = {
    type: 'object',
    properties: {
        kind: { const: 'sync' },
        // token: { type: 'string' },
        col: { type: 'string' },
        colrev: { type: 'integer' }
    },
    required: ['kind', 'col'],
    additionalProperties: false
}

const changeMessageSchema = {
    type: 'object',
    properties: {
        kind: { const: 'change' },
        col: { type: 'string' },
        id: { type: 'string' },
        changeid: { type: 'string' },
        op: { type: 'string' },
        data: {
            oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } }
            ]
        }
    },
    required: ['kind', 'col', 'id', 'changeid', 'op'],
    additionalProperties: false,
    oneOf: [
        {
            properties: {
                op: { const: Op.Create },
                data: { type: 'string' }
            },
            required: ['data']
        },
        {
            properties: {
                op: { const: Op.Modify },
                data: { type: 'array', items: { type: 'string' } }
            },
            required: ['data']
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

type MessageQueueCallback<T> = (msg: T) => Promise<void>

class SequentialMessageQueue<T> {
    constructor(callback: MessageQueueCallback<T>) {
        this.callback = callback
    }

    messages: T[] = []
    callback: (msg: T) => Promise<void>
    isRunning = false

    push(msg: T) {
        this.messages.push(msg)
        if (this.isRunning) return
        this.isRunning = true
        this.processMessage()
    }

    async processMessage() {
        const msg = this.messages.shift()
        if (msg === undefined) {
            this.isRunning = false
            return
        }
        await this.callback(msg)
        this.processMessage()
    }
}


const serializeDate = (d: Date) => d.toISOString()

type WsMessage = [WebSocket, Buffer]

const clientDisconnectTimeout = 10000

interface SinkronServerOptions {
    sinkron: Sinkron
    host?: string
    port?: number
}

const defaultServerOptions = {
    host: '127.0.0.1',
    port: 8080
}

class SinkronServer {
    sinkron: Sinkron
    ws: WebSocketServer

    clients = new Map<WebSocket, { subscriptions: Set<string> }>()
    collections = new Map<string, { subscribers: Set<WebSocket> }>()

    logger: ReturnType<typeof pino>
    messageQueue: SequentialMessageQueue<WsMessage>

    constructor(options: SinkronServerOptions) {
        this.logger = pino({
            transport: { target: 'pino-pretty' }
        })
        this.logger.level = 'debug'

        const { sinkron, host, port } = { ...defaultServerOptions, ...options }
        this.sinkron = sinkron

        this.messageQueue = new SequentialMessageQueue<WsMessage>(
            async (msg: WsMessage) => {
                try {
                    await this.handleMessage(msg)
                } catch (e) {
                    this.logger.error(
                        'Unhandled exception while handling message, %o',
                        e
                    )
                }
            }
        )

        this.ws = new WebSocketServer({ noServer: true })
        this.ws.on('connection', this.onConnect.bind(this))
    }

    async onConnect(ws: WebSocket) {
        this.logger.debug('Client connected')
        this.clients.set(ws, { subscriptions: new Set() })
        setTimeout(() => {
            const client = this.clients.get(ws)
            if (client === undefined) return
            if (client.subscriptions.size === 0) ws.close()
        }, clientDisconnectTimeout)
        ws.on('message', (msg: Buffer) => this.messageQueue.push([ws, msg]))
        ws.on('close', () => this.onDisconnect(ws))
    }

    async handleMessage([ws, msg]: WsMessage) {
        const str = msg.toString('utf-8')

        let parsed: ClientMessage
        try {
            parsed = JSON.parse(str.toString())
        } catch (e) {
            this.logger.debug('Invalid JSON in message')
            return
        }

        this.logger.trace('Message recieved: %o', parsed)

        const isValid = validateMessage(parsed)
        if (!isValid) {
            // TODO react something
            this.logger.debug(
                'Invalid message schema: %o',
                validateMessage.errors
            )
            return
        }

        if (parsed.kind === 'sync') {
            await this.handleSyncMessage(ws, parsed)
        } else {
            // parsed.kind === "change"
            await this.handleChangeMessage(parsed, ws)
        }
    }

    async handleSyncMessage(ws: WebSocket, msg: SyncMessage) {
        const { col, colrev } = msg

        console.log("HANDLE SYNC")

        // TODO error if second sync message

        /*
        const isAuthorized = await this.sinkron.verifyAuth(token)
        if (!isAuthorized) {
            const errorMsg: SyncErrorMessage = {
                kind: 'sync_error',
                col,
                code: ErrorCode.AccessDenied
            }
            ws.send(JSON.stringify(errorMsg))
            return
        }
        */

        // TODO check collection permission

        const result = await this.sinkron.syncCollection(col, colrev)
        if (!result.isOk) {
            const errorMsg: SyncErrorMessage = {
                kind: 'sync_error',
                col,
                code: result.error.code
            }
            ws.send(JSON.stringify(errorMsg))
            return
        }

        result.value.documents.forEach((doc) => {
            const msg: DocMessage = {
                kind: 'doc',
                col,
                id: doc.id,
                // @ts-ignore
                data: doc.data ? doc.data.toString('base64') : null,
                createdAt: serializeDate(doc.createdAt),
                updatedAt: serializeDate(doc.updatedAt)
            }
            ws.send(JSON.stringify(msg))
        })

        const syncCompleteMsg = {
            kind: 'sync_complete',
            col,
            colrev: result.value.colrev
        }
        ws.send(JSON.stringify(syncCompleteMsg))

        this.addSubscriber(msg.col, ws)
        this.logger.debug('Client subscribed to collection %s', msg.col)
    }

    async handleChangeMessage(msg: ChangeMessage, client: WebSocket) {
        const { op, col } = msg

        // TODO check document permissions

        let res: ResultType<Document, RequestError>
        if (op === Op.Create) {
            res = await this.handleCreateMessage(msg)
        } else if (op === Op.Delete) {
            res = await this.sinkron.deleteDocument(msg.id)
        } else {
            // if (op === Op.Modify)
            res = await this.handleModifyMessage(msg)
        }
        if (!res.isOk) {
            this.logger.debug(
                'Failed to apply change, id: %s, error: %s, %s',
                msg.id,
                res.error.code,
                res.error.details
            )
            const errorMsg: ErrorMessage = {
                kind: 'error',
                id: msg.id,
                changeid: msg.changeid,
                code: res.error.code
            }
            client.send(JSON.stringify(errorMsg))
            return
        }
        const doc = res.value
        this.logger.debug('Change applied, id: %s, op: %s', msg.id, msg.op)

        const collection = this.collections.get(col)
        if (collection) {
            const { colrev, updatedAt, createdAt } = doc!
            const response: ChangeMessage = { ...msg, colrev }
            response.updatedAt = serializeDate(updatedAt)
            if (msg.op === Op.Create) {
                response.createdAt = serializeDate(createdAt)
            }
            collection.subscribers.forEach((sub) =>
                sub.send(JSON.stringify(response))
            )
        }
    }

    async handleCreateMessage(msg: CreateMessage) {
        const { id, col, data } = msg
        return await this.sinkron.createDocument(
            id!,
            col,
            Buffer.from(data, 'base64')
        )
    }

    async handleModifyMessage(msg: ModifyMessage) {
        const { id, col, data } = msg
        const doc = await this.sinkron.updateDocument(
            id,
            data.map((c) => Buffer.from(c, 'base64'))
        )
        return doc
    }

    onDisconnect(ws: WebSocket) {
        this.logger.debug('Client disconnected')
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
}

export { SinkronServer }
