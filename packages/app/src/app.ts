import { createServer } from "http"
// import type { IncomingMessage } from "http"
// import { Duplex } from "stream"
import path from "path"

import Fastify, { FastifyInstance, FastifyRequest } from "fastify"
import { DataSource, Repository } from "typeorm"
import Bowser from "bowser"
import cors from "@fastify/cors"
import { SinkronClient } from "@sinkron/client/lib/client"

import dataSource from "./db"
import { config, SinkronAppConfig } from "./config"
import {
    User,
    Otp,
    AuthToken,
    Space,
    SpaceMember,
    Invite,
    File,
    Post
} from "./entities"

import { EmailSender, FakeEmailSender, SmtpEmailSender } from "./email"
import { LocalObjectStorage } from "./files/local"
import { S3ObjectStorage } from "./files/s3"
import { UserService } from "./services/user"
import { AuthService } from "./services/auth"
import { SpaceService } from "./services/space"
import { InviteService } from "./services/invite"
import { FileService, ObjectStorage } from "./services/file"
import { PostService } from "./services/post"

import invitesRoutes from "./routes/invites"
import spacesRoutes from "./routes/spaces"
import postsRoutes from "./routes/posts"

const authTokenHeader = "x-sinkron-auth-token"

// Except for "loginRoutes"
declare module "fastify" {
    interface FastifyRequest {
        token: AuthToken
    }
}

export type AppModels = {
    users: Repository<User>
    otps: Repository<Otp>
    tokens: Repository<AuthToken>
    spaces: Repository<Space>
    members: Repository<SpaceMember>
    invites: Repository<Invite>
    files: Repository<File>
    posts: Repository<Post>
}

type AppProps = {
    host?: string
    port?: number
}

const defaultAppProps = {
    host: "0.0.0.0",
    port: 80
}

const parseClient = (request: FastifyRequest) => {
    const userAgent = request.headers["user-agent"]
    if (userAgent === undefined || Array.isArray(userAgent)) {
        return "Unknown client"
    }
    const data = Bowser.parse(userAgent)
    const browser =
        data.browser.name === ""
            ? "Unknown browser"
            : `${data.browser.name} ${data.browser.version}`
    const os =
        data.os.name === undefined
            ? "Unknown os"
            : `${data.os.name} ${data.os.version}`
    return `${browser} / ${os}`
}

const loginSchema = {
    type: "object",
    properties: {
        email: { type: "string", minLength: 5, maxLength: 100 }
    },
    required: ["email"],
    additionalProperties: false
}

type CheckCodeBody = { id: string; code: string }

const checkCodeSchema = {
    type: "object",
    properties: {
        id: { type: "string", format: "uuid" },
        code: { type: "string", minLength: 6, maxLength: 6, pattern: "^\\d+$" }
    },
    required: ["id", "code"],
    additionalProperties: false
}

const loginRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.post<{ Body: { email: string } }>(
        "/login",
        { schema: { body: loginSchema } },
        async (request, reply) => {
            const { email } = request.body
            const res = await app.services.auth.sendCode(app.models, email)
            if (!res.isOk) {
                reply.code(500).send({ error: res.error })
                return
            }
            reply.send(res.value)
        }
    )

    fastify.post<{ Body: CheckCodeBody }>(
        "/code",
        { schema: { body: checkCodeSchema } },
        async (request, reply) => {
            const { id, code } = request.body
            const authRes = await app.services.auth.authorizeWithCode(
                app.models,
                {
                    id,
                    code,
                    client: parseClient(request)
                }
            )
            if (!authRes.isOk) {
                reply.code(500).send({ error: authRes.error })
                return
            }
            const token = authRes.value

            const profileRes = await app.services.users.getProfile(
                app.models,
                token.userId
            )
            if (!profileRes.isOk) {
                reply
                    .code(500)
                    .send({ error: { message: "Couldn't authorize" } })
                return
            }

            reply.send({ user: profileRes.value, token: token.token })
        }
    )

    fastify.post("/logout", async (request, reply) => {
        const token = request.headers[authTokenHeader]
        if (
            token !== undefined &&
            typeof token == "string" &&
            token.length > 1
        ) {
            await app.services.auth.deleteAuthToken(app.models, token)
        }
        reply.send()
    })
}

const accountRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.get("/account/sessions", async (request, reply) => {
        const { userId, token } = request.token
        const sessions = await app.services.auth.getActiveSessions(app.models, {
            userId,
            token
        })
        reply.send(sessions)
    })

    fastify.post("/account/sessions/terminate", async (request, reply) => {
        const { token, userId } = request.token
        await app.services.auth.deleteOtherTokens(app.models, {
            token,
            userId
        })
        const sessions = await app.services.auth.getActiveSessions(app.models, {
            userId,
            token
        })
        reply.send(sessions)
    })
}

const appRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.addHook("preValidation", async (request, reply) => {
        const token = request.headers[authTokenHeader]
        if (token && typeof token === "string") {
            const res = await app.services.auth.verifyAuthToken(
                app.models,
                token
            )
            if (res.isOk && res.value !== null) {
                request.token = res.value
                return
            }
        }
        reply.code(401).send({ error: { message: "Unauthorized" } })
    })

    fastify.get("/profile", async (request, reply) => {
        const userId = request.token.userId

        const res = await app.services.users.getProfile(app.models, userId)
        if (!res.isOk) {
            reply.code(500).send({ error: { message: "Server error" } })
            return
        }
        reply.send(res.value)
    })

    fastify.get("/notifications", async (request, reply) => {
        const userId = request.token.userId
        const invites = await app.services.invites.getUserActiveInvites(
            app.models,
            userId
        )
        app.services.users.setUnreadNotifications(app.models, userId, false)
        reply.send({ invites })
    })

    fastify.register(accountRoutes(app))
    fastify.register(spacesRoutes(app))
    fastify.register(invitesRoutes(app))
    fastify.register(postsRoutes(app))
}

type Services = {
    users: UserService
    auth: AuthService
    spaces: SpaceService
    invites: InviteService
    file: FileService
    posts: PostService
}

class App {
    config: SinkronAppConfig
    sinkron: SinkronClient
    storage: ObjectStorage
    emailSender: EmailSender
    // channels: ChannelServer
    fastify: FastifyInstance
    db: DataSource
    models: AppModels
    services: Services

    constructor() {
        this.config = config
        this.db = dataSource
        this.emailSender =
            config.mail.type === "console"
                ? new FakeEmailSender()
                : new SmtpEmailSender(config.mail)
        this.storage =
            config.storage.type === "s3"
                ? new S3ObjectStorage(config.storage)
                : new LocalObjectStorage(
                      path.join(process.cwd(), config.storage.path)
                  )
        this.services = {
            users: new UserService(this),
            auth: new AuthService(this),
            spaces: new SpaceService(this),
            invites: new InviteService(this),
            file: new FileService({ app: this, storage: this.storage }),
            posts: new PostService(this)
        }
        this.models = {
            users: this.db.getRepository<User>("user"),
            otps: this.db.getRepository<Otp>("otp"),
            tokens: this.db.getRepository<AuthToken>("token"),
            spaces: this.db.getRepository<Space>("space"),
            members: this.db.getRepository<SpaceMember>("space_member"),
            invites: this.db.getRepository<Invite>("invite"),
            files: this.db.getRepository<File>("file"),
            posts: this.db.getRepository<Post>("post")
        }
        this.sinkron = new SinkronClient(config.sinkron)
        // this.channels = new ChannelServer({})
        this.fastify = this.createFastify()
    }

    async transaction<T>(cb: (models: AppModels) => Promise<T>) {
        return this.db.transaction((m) => {
            const models = {
                users: m.getRepository<User>("user"),
                otps: m.getRepository<Otp>("otp"),
                tokens: m.getRepository<AuthToken>("token"),
                spaces: m.getRepository<Space>("space"),
                members: m.getRepository<SpaceMember>("space_member"),
                invites: m.getRepository<Invite>("invite"),
                files: m.getRepository<File>("file"),
                posts: m.getRepository<Post>("post")
            }
            return cb(models)
        })
    }

    async init() {
        await this.db.initialize()
    }

    async destroy() {
        await this.db.destroy()
        // this.channels.dispose()
    }

    /*
    async handleUpgrade(
        request: IncomingMessage,
        socket: Duplex,
        head: Buffer
    ) {
        const matchChannels = request.url!.match(/^\/channels\/(.+)$/)
        if (matchChannels) {
            const token = matchChannels[1]
            const res = await this.services.auth.verifyAuthToken(
                this.models,
                token
            )
            if (res.isOk && res.value !== null) {
                this.channels.ws.handleUpgrade(request, socket, head, (ws) => {
                    this.channels.ws.emit("connection", ws, request)
                })
            } else {
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
                socket.destroy()
            }
            return
        }

        socket.write("HTTP/1.1 404 Not Found\r\n\r\n")
        socket.destroy()
    }
    */

    createFastify() {
        const fastify = Fastify({
            serverFactory: (handler) => {
                const server = createServer(handler)
                // server.on("upgrade", this.handleUpgrade.bind(this))
                return server
            }
        })

        fastify.addContentTypeParser(
            "application/octet-stream",
            { parseAs: "buffer" },
            (_req, body, done) => {
                done(null, body)
            }
        )

        fastify.setErrorHandler((error, _request, reply) => {
            if (error.validation) {
                reply.status(422).send({
                    error: {
                        message: "Invalid request",
                        details: { error: String(error) }
                    }
                })
            } else {
                reply.status(500).send({
                    error: { message: "Internal server error" }
                })
                console.log(error)
            }
        })

        fastify.get("/", (_request, reply) => {
            reply.send("Sinkron API")
        })

        fastify.post<{ Params: { token: string } }>(
            "/sinkron_auth/:token",
            async (request, reply) => {
                const { token } = request.params
                const res = await this.services.auth.verifyAuthToken(
                    this.models,
                    token
                )
                if (res.isOk && res.value !== null) {
                    reply.send(res.value.userId)
                } else {
                    reply.code(401).send("Couldn't authorize")
                }
            }
        )

        fastify.get<{ Params: { postId: string } }>(
            "/posts/:postId/content",
            async (request, reply) => {
                const { postId } = request.params
                const content = await this.services.posts.content(
                    this.models,
                    postId
                )
                if (content === null) {
                    reply
                        .code(500)
                        .send({ error: { message: "Post not found" } })
                    return
                }
                reply.send(content)
            }
        )

        if (config.storage.type === "local") {
            fastify.get<{ Params: { spaceId: string; fileId: string } }>(
                "/files/:fileId",
                async (request, reply) => {
                    const { fileId } = request.params
                    const res = await this.services.file.storage.get(fileId)
                    if (!res.isOk) {
                        reply
                            .code(404)
                            .send({ error: { message: "File not found" } })
                        return
                    }
                    reply.header("Content-type", "image/jpeg").send(res.value)
                }
            )
        }

        fastify.register(loginRoutes(this))

        fastify.register(appRoutes(this))
        fastify.register(cors, {
            origin: [
                "tauri://localhost",
                "http://tauri.localhost",
                "https://sinkron.xyz",
                "http://localhost:1337"
            ],
            credentials: true
        })

        return fastify
    }

    start(props: AppProps = {}) {
        const { host, port } = { ...defaultAppProps, ...props }
        this.fastify.listen({ host, port }, (err) => {
            if (err) {
                console.log("Error while starting server:")
                console.log(err)
            } else {
                console.log(`Server started at ${host}:${port}`)
            }
        })
    }
}

export { App }
