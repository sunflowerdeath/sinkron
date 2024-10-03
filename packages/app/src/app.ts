import { createServer } from "http"
import type { IncomingMessage } from "http"
import { Duplex } from "stream"
import path from "path"

import Fastify, { FastifyInstance, FastifyRequest } from "fastify"
import { DataSource, Or, Equal, Not, Repository } from "typeorm"
import * as Bowser from "bowser"
import cors from "@fastify/cors"
import { Sinkron, SinkronServer, ChannelServer } from "sinkron"

import dataSource from "./db/app"
import { config, SinkronConfig } from "./config"
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

import { EmailSender, FakeEmailSender } from "./email"
import { LocalObjectStorage } from "./files/local"
import { S3ObjectStorage } from "./files/s3"
import { UserService } from "./services/user"
import { AuthService } from "./services/auth"
import { SpaceService } from "./services/space"
import { InviteService } from "./services/invite"
import { FileService, ObjectStorage } from "./services/file"
import { PostService } from "./services/post"

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
        email: {
            type: "string",
            minLength: 5,
            maxLength: 100
        }
    },
    required: ["email"],
    additionalProperties: false
}

const checkCodeSchema = {
    type: "object",
    properties: {
        id: {
            type: "string",
            format: "uuid"
        },
        code: {
            type: "string",
            minLength: 6,
            maxLength: 6,
            pattern: "^\\d+$"
        }
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
            await app.transaction(async (models) => {
                const res = await app.services.auth.sendCode(models, email)
                if (!res.isOk) {
                    reply.code(500).send({ error: res.error })
                    return
                }
                reply.send(res.value)
            })
        }
    )

    fastify.post<{ Body: { id: string; code: string } }>(
        "/code",
        { schema: { body: checkCodeSchema } },
        async (request, reply) => {
            const { id, code } = request.body
            await app.transaction(async (models) => {
                const authRes = await app.services.auth.authorizeWithCode(
                    models,
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
                    models,
                    token.userId
                )
                if (!profileRes.isOk) {
                    reply
                        .code(500)
                        .send({ error: { message: "Couldn't authorize" } })
                    return
                }

                reply.send({ user: profileRes.value, token: token.token })
            })
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
        await app.transaction(async (models) => {
            const sessions = await app.services.auth.getActiveSessions(models, {
                userId,
                token
            })
            reply.send(sessions)
        })
    })

    fastify.post("/account/sessions/terminate", async (request, reply) => {
        const { token, userId } = request.token
        await app.transaction(async (models) => {
            await app.services.auth.deleteOtherTokens(models, {
                token,
                userId
            })
            const sessions = await app.services.auth.getActiveSessions(models, {
                userId,
                token
            })
            reply.send(sessions)
        })
    })
}

type SpaceCreateBody = { name: string }

const spaceCreateRenameSchema = {
    type: "object",
    properties: {
        name: { type: "string", minLength: 1 }
    },
    required: ["name"],
    additionalProperties: false
}

const spacesRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.post<{ Body: SpaceCreateBody }>(
        "/spaces/new",
        { schema: { body: spaceCreateRenameSchema } },
        async (request, reply) => {
            const { name } = request.body
            await app.transaction(async (models) => {
                const res = await app.services.spaces.create(models, {
                    name,
                    ownerId: request.token.userId
                })
                if (!res.isOk) {
                    reply.code(500).send(res.error)
                    return
                }
                reply.send(res.value)
            })
        }
    )

    fastify.post<{ Params: { id: string }; Body: { name: string } }>(
        "/spaces/:id/rename",
        { schema: { body: spaceCreateRenameSchema } },
        async (request, reply) => {
            const { id } = request.params
            const { name } = request.body
            await app.transaction(async (models) => {
                const exist = await app.services.spaces.exists(models, id)
                if (!exist) {
                    reply.code(500).send()
                    return
                }

                const member = await models.members.findOne({
                    where: { userId: request.token.userId, spaceId: id },
                    select: { role: true }
                })
                if (
                    member === null ||
                    !["admin", "owner"].includes(member.role)
                ) {
                    reply.code(500).send()
                    return
                }

                await app.services.spaces.rename(models, id, name)
                reply.send({})
            })
        }
    )

    fastify.post<{ Params: { id: string } }>(
        "/spaces/:id/delete",
        async (request, reply) => {
            const { id } = request.params
            await app.transaction(async (models) => {
                const space = await models.spaces.findOne({
                    where: { id },
                    select: { ownerId: true }
                })
                if (space === null || space.ownerId !== request.token.userId) {
                    reply.code(500).send()
                    return
                }
                await app.services.spaces.delete(models, id)
                reply.send({})
            })
        }
    )

    fastify.post<{ Params: { id: string } }>(
        "/spaces/:id/leave",
        async (request, reply) => {
            const { id } = request.params
            await app.transaction(async (models) => {
                const res = await models.members.delete({
                    spaceId: id,
                    userId: request.token.userId,
                    role: Not(Equal("owner"))
                })
                if (res.affected === 0) {
                    reply
                        .code(500)
                        .send({ error: { message: "Invalid request" } })
                    return
                }
                reply.send({})
            })
        }
    )

    fastify.get<{ Params: { id: string } }>(
        "/spaces/:id/members",
        async (request, reply) => {
            const { id } = request.params
            await app.transaction(async (models) => {
                const exist = await app.services.spaces.exists(models, id)
                if (!exist) {
                    reply.code(500).send()
                    return
                }

                // Check if user is member
                const count = await models.members.count({
                    where: { userId: request.token.userId, spaceId: id }
                })
                if (count === 0) {
                    reply.code(500).send()
                    return
                }

                const members = await app.services.spaces.getMembers(models, id)
                const invites =
                    await app.services.invites.getSpaceActiveInvites(models, id)
                reply.send({ members, invites })
            })
        }
    )

    fastify.post("/spaces/:id/members/:member/update", () => {
        // update member of a space (change role)
        // TODO
    })

    fastify.post<{ Params: { spaceId: string; userId: string } }>(
        "/spaces/:spaceId/members/:userId/remove",
        async (request, reply) => {
            await app.transaction(async (models) => {
                const { spaceId, userId } = request.params

                const memberRole = await app.services.spaces.getMemberRole(
                    models,
                    { userId, spaceId }
                )
                if (memberRole === null) {
                    reply
                        .code(500)
                        .send({ error: { message: "Member not found" } })
                    return
                }

                const currentUserRole = await app.services.spaces.getMemberRole(
                    models,
                    { userId: request.token.userId, spaceId }
                )
                const isPermitted =
                    currentUserRole !== null &&
                    memberRole !== "owner" &&
                    (memberRole === "admin"
                        ? currentUserRole === "owner"
                        : ["admin", "owner"].includes(currentUserRole))
                if (!isPermitted) {
                    reply
                        .code(500)
                        .send({ error: { message: "Not permitted" } })
                    return
                }

                await models.members.delete({ id: userId })
                reply.send({})
            })
        }
    )

    fastify.post<{ Body: Buffer; Params: { spaceId: string; fileId: string } }>(
        "/spaces/:spaceId/upload_image/:fileId",
        { bodyLimit: 20 * 1024 * 1024 /* 20Mb */ },
        async (request, reply) => {
            await app.transaction(async (models) => {
                const { spaceId, fileId } = request.params

                const role = await app.services.spaces.getMemberRole(models, {
                    userId: request.token.userId,
                    spaceId
                })
                if (
                    role === null ||
                    !["admin", "owner", "editor"].includes(role)
                ) {
                    reply
                        .code(500)
                        .send({ error: { message: "Not permitted" } })
                    return
                }

                const res = await app.services.file.uploadImage(models, {
                    data: request.body,
                    spaceId,
                    fileId
                })
                if (!res.isOk) {
                    reply.code(500).send({ error: res.error })
                    return
                }

                reply.send({})
            })
        }
    )
}

type InviteCreateBody = {
    spaceId: string
    toEmail: string
    role: "readonly" | "editor" | "admin"
}

const inviteCreateBodySchema = {
    type: "object",
    properties: {
        spaceId: { type: "string", minLength: 1 },
        toEmail: { type: "string", minLength: 1 },
        role: { type: "string", minLength: 1 } // TODO one of
    },
    required: ["spaceId", "toEmail", "role"],
    additionalProperties: false
}

type InviteUpdateBody = { role: "readonly" | "editor" | "admin" }

const inviteUpdateBodySchema = {
    type: "object",
    properties: {
        role: { type: "string", minLength: 1 } // TODO one of
    },
    required: ["role"],
    additionalProperties: false
}

const invitesRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.post<{ Body: InviteCreateBody }>(
        "/invites/new",
        { schema: { body: inviteCreateBodySchema } },
        async (request, reply) => {
            const { spaceId, toEmail, role } = request.body
            await app.transaction(async (models) => {
                const res = await app.services.invites.create(models, {
                    fromId: request.token.userId,
                    spaceId,
                    toEmail,
                    role
                })
                if (!res.isOk) {
                    reply.code(500).send({ error: res.error })
                    return
                }
                await app.services.users.setUnreadNotifications(
                    models,
                    res.value.toId
                )
                reply.send(res.value)
            })
        }
    )

    fastify.post<{ Params: { id: string }; Body: InviteUpdateBody }>(
        "/invites/:id/update",
        { schema: { body: inviteUpdateBodySchema } },
        async (request, reply) => {
            const { role } = request.body
            const { id } = request.params
            await app.transaction(async (models) => {
                const invite = await models.invites.findOne({
                    where: { id, status: "sent" },
                    select: { spaceId: true }
                })
                if (invite === null) {
                    reply
                        .code(500)
                        .send({ error: { message: "Invite not found" } })
                    return
                }

                const currentUserRole = await app.services.spaces.getMemberRole(
                    models,
                    {
                        userId: request.token.userId,
                        spaceId: invite.spaceId
                    }
                )
                const isPermitted =
                    currentUserRole !== null &&
                    (role === "admin"
                        ? currentUserRole === "owner"
                        : ["admin", "owner"].includes(currentUserRole))
                if (!isPermitted) {
                    reply
                        .code(500)
                        .send({ error: { message: "Not permitted" } })
                    return
                }

                await models.invites.update({ id }, { role })

                const inviteRes = await app.services.invites.get(models, id)
                if (!inviteRes.isOk) {
                    reply.code(500).send()
                    return
                }
                reply.send(inviteRes.value)
            })
        }
    )

    fastify.post<{ Params: { id: string } }>(
        "/invites/:id/accept",
        async (request, reply) => {
            const id = request.params.id
            await app.transaction(async (models) => {
                const userId = request.token.userId

                const updateRes = await models.invites.update(
                    { id, status: "sent", toId: userId },
                    { status: "accepted" }
                )
                if (updateRes.affected === 0) {
                    reply
                        .code(500)
                        .send({ error: { message: "Invite not found" } })
                    return
                }

                const inviteRes = await app.services.invites.get(models, id)
                if (!inviteRes.isOk) {
                    reply.code(500).send()
                    return
                }
                const invite = inviteRes.value

                await app.services.spaces.addMember(models, {
                    userId: invite.to.id,
                    spaceId: invite.space.id,
                    role: invite.role
                })

                const getSpaceRes = await app.services.spaces.getUserSpace(
                    models,
                    userId,
                    invite.spaceId
                )
                if (!getSpaceRes.isOk) {
                    reply.code(500).send(getSpaceRes.error)
                    return
                }
                // @ts-expect-error SpaceView
                invite.space = getSpaceRes.value

                reply.send(invite)
            })
        }
    )

    fastify.post<{ Params: { id: string } }>(
        "/invites/:id/decline",
        async (request, reply) => {
            const id = request.params.id
            await app.transaction(async (models) => {
                const updateRes = await models.invites.update(
                    { id, status: "sent", toId: request.token.userId },
                    { status: "declined" }
                )
                if (updateRes.affected === 0) {
                    reply
                        .code(500)
                        .send({ error: { message: "Invite not found" } })
                    return
                }

                const inviteRes = await app.services.invites.get(models, id)
                if (!inviteRes.isOk) {
                    reply.code(500).send()
                    return
                }
                reply.send(inviteRes.value)
            })
        }
    )

    fastify.post<{ Params: { id: string } }>(
        "/invites/:id/cancel",
        async (request, reply) => {
            const id = request.params.id
            await app.transaction(async (models) => {
                const invite = await models.invites.findOne({
                    where: { id, status: "sent" },
                    select: { spaceId: true }
                })
                if (invite === null) {
                    reply
                        .code(500)
                        .send({ error: { message: "Invite not found" } })
                    return
                }

                const role = await app.services.spaces.getMemberRole(models, {
                    userId: request.token.userId,
                    spaceId: invite.spaceId
                })
                if (role === null || !["admin", "owner"].includes(role)) {
                    reply
                        .code(500)
                        .send({ error: { message: "Not permitted" } })
                    return
                }

                await models.invites.update({ id }, { status: "cancelled" })

                const inviteRes = await app.services.invites.get(models, id)
                if (!inviteRes.isOk) {
                    reply.code(500).send()
                    return
                }
                reply.send(inviteRes.value)
            })
        }
    )

    fastify.post<{ Params: { id: string } }>(
        "/invites/:id/hide",
        async (request, reply) => {
            const id = request.params.id
            await app.transaction(async (models) => {
                const updateRes = await models.invites.update(
                    {
                        id,
                        status: Or(Equal("accepted"), Equal("declined")),
                        fromId: request.token.userId
                    },
                    { isHidden: true }
                )
                if (updateRes.affected === 0) {
                    reply
                        .code(500)
                        .send({ error: { message: "Invite not found" } })
                    return
                }

                const inviteRes = await app.services.invites.get(models, id)
                if (!inviteRes.isOk) {
                    reply.code(500).send()
                    return
                }
                reply.send(inviteRes.value)
            })
        }
    )
}

type PostCreateBody = { docId: string; spaceId: string }

const postsRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.post<{ Body: PostCreateBody }>(
        "/posts/new",
        async (request, reply) => {
            const { docId, spaceId } = request.body
            await app.transaction(async (models) => {
                const role = await app.services.spaces.getMemberRole(models, {
                    userId: request.token.userId,
                    spaceId
                })
                if (role === null || !["admin", "owner"].includes(role)) {
                    reply
                        .code(500)
                        .send({ error: { message: "Not permitted" } })
                    return
                }

                const res = await app.services.posts.publish(models, {
                    docId,
                    spaceId
                })
                if (!res.isOk) {
                    reply.code(500).send(res.error)
                    return
                }

                reply.send(res.value)
            })
        }
    )

    fastify.post<{ Body: PostCreateBody }>("/posts/:id/update", () => {})

    fastify.post<{ Body: PostCreateBody }>("/posts/:id/unpublish", () => {})

    fastify.post<{ Body: PostCreateBody }>("/posts/:id", () => {})

    fastify.post<{ Body: PostCreateBody }>("/posts/:id/content", () => {})
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
        await app.transaction(async (models) => {
            const res = await app.services.users.getProfile(models, userId)
            if (!res.isOk) {
                reply.code(500).send({ error: { message: "Server error" } })
                return
            }
            reply.send(res.value)
        })
    })

    fastify.get("/notifications", async (request, reply) => {
        const userId = request.token.userId
        await app.transaction(async (models) => {
            const invites = await app.services.invites.getUserActiveInvites(
                models,
                userId
            )
            const res = { invites }
            app.services.users.setUnreadNotifications(models, userId, false)
            reply.send(res)
        })
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
    config: SinkronConfig
    sinkron: Sinkron
    sinkronServer: SinkronServer
    storage: ObjectStorage
    emailSender: EmailSender
    channels: ChannelServer
    fastify: FastifyInstance
    db: DataSource
    models: AppModels
    services: Services

    constructor() {
        this.config = config
        this.db = dataSource
        this.emailSender = new FakeEmailSender()
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
        this.sinkron = new Sinkron({ db: config.sinkron.db })
        this.sinkronServer = new SinkronServer({ sinkron: this.sinkron })
        this.channels = new ChannelServer({})
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
        await this.sinkron.init()
        await this.db.initialize()
    }

    async destroy() {
        await this.db.destroy()
        this.channels.dispose()
    }

    async handleUpgrade(
        request: IncomingMessage,
        socket: Duplex,
        head: Buffer
    ) {
        const matchSinkron = request.url!.match(/^\/sinkron\/(.+)$/)
        if (matchSinkron) {
            const token = matchSinkron[1]
            const res = await this.services.auth.verifyAuthToken(
                this.models,
                token
            )
            if (res.isOk && res.value !== null) {
                this.sinkronServer.upgrade(request, socket, head, {
                    id: res.value.userId
                })
            } else {
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
                socket.destroy()
            }
            return
        }

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

    createFastify() {
        const fastify = Fastify({
            serverFactory: (handler) => {
                const server = createServer(handler)
                server.on("upgrade", this.handleUpgrade.bind(this))
                return server
            }
        })

        fastify.addContentTypeParser(
            "application/octet-stream",
            { parseAs: "buffer" },
            (req, body, done) => {
                done(null, body)
            }
        )

        fastify.setErrorHandler((error, request, reply) => {
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

        fastify.get("/", (request, reply) => {
            reply.send("Sinkron API")
        })

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
                "https://sinkron.xyz",
                "http://localhost:1337"
            ],
            credentials: true
        })

        return fastify
    }

    start(props: AppProps) {
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
