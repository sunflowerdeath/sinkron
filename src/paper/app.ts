import { createServer } from 'http'
import type { Server, ClientRequest, IncomingMessage } from 'http'

import cookie from 'cookie'
import Ajv, { JSONSchemaType } from 'ajv'
import {
    EntitySchema,
    DataSource,
    Repository,
    MoreThan,
    MoreThanOrEqual,
    EntityManager
} from 'typeorm'

import Koa from 'koa'
import koaBodyParser from 'koa-bodyparser'
import Router from '@koa/router'

import { Sinkron, SinkronServer } from '../sinkron/server'

import { Controller } from './controller'
import type { User, Space, SpaceMember } from './entities'
import { entities } from './entities'

import loginRouter from "./routes/login"
import spacesRouter from "./routes/spaces"
import invitesRouter from "./routes/invites"

const credentialsSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        password: { type: 'string' }
    },
    required: ['name', 'password'],
    additionalProperties: false
}

type AppProps = {
    sinkron: Sinkron
    host?: string
    port?: number
}

class App {
    sinkron: Sinkron
    sinkronServer: SinkronServer
    http: Server
    host?: string
    port?: number
    db: DataSource
    controller: Controller

    constructor(props: AppProps) {
        const { sinkron, host, port } = props
        this.host = host
        this.port = port

        this.db = new DataSource({
            type: 'better-sqlite3',
            database: ':memory:',
            entities,
            synchronize: true,
            logging: ['query', 'error']
        })

        this.sinkron = sinkron
        this.sinkronServer = new SinkronServer({ sinkron })

        this.controller = new Controller(this.db, sinkron)

        const koa = this.createApp()

        const authenticate = async (
            request: IncomingMessage
        ): Promise<string | undefined> => {
            const token = request.url!.slice(1)
            const res = await this.controller.users.verifyAuthToken(token)
            if (res.isOk && res.value !== null) {
                return res.value.userId
            } else {
                return undefined
            }
        }

        this.http = createServer(koa.callback())
        this.http.on('upgrade', (request, socket, head) => {
            authenticate(request).then((userId) => {
                if (userId === undefined) {
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
                    socket.destroy()
                    return
                }
                this.sinkronServer.ws.handleUpgrade(
                    request,
                    socket,
                    head,
                    (ws) => {
                        this.sinkronServer.ws.emit('connection', ws, request)
                    }
                )
            })
        })
    }

    async init() {
        await this.db.initialize()
    }

    createApp() {
        const app = new Koa()

        app.keys = ['VERY SECRET KEY']
        app.use(koaBodyParser())

        app.use(loginRouter(this.controller).routes())

        const requireAuth = async (ctx, next) => {
            const token = ctx.cookies.get('token')
            if (token) {
                const res = await this.controller.users.verifyAuthToken(token)
                if (res.isOk && res !== null) {
                    ctx.token = res.value
                    await next()
                    return
                }
            }
            ctx.status = 401
            ctx.end('Unauthorized')
        }

        const router = new Router()
        router.use(requireAuth)
        router.get('/profile', async (ctx) => {
            const token = ctx.token
            const res = await this.controller.users.getUserProfile(token.userId)
            if (!res.isOk) throw 'hz'
            ctx.body = res.value
        })
        router.use(spacesRouter(this.controller).routes())
        router.use(invitesRouter(this.controller).routes())

        app.use(router.routes())

        return app
    }

    async start() {
        this.http.listen({ host: this.host, port: this.port }, () => {
            console.log(`Server started at ${this.host}:${this.port}`)
            // this.logger.info(`Server started at ${this.host}:${this.port}`)
        })
    }
}

export { App }
