import { createServer } from "http"
import type { IncomingMessage } from "http"
import Fastify, { FastifyInstance } from "fastify"
import fastifyCookie from "@fastify/cookie"
import { DataSource, Raw, In, Or, Equal, Repository } from "typeorm"
import { Sinkron, SinkronServer } from "sinkron"
import { v4 as uuidv4 } from "uuid"
import * as Automerge from "@automerge/automerge"

import { entities } from "./entities"
import { Result, ResultType } from "./utils/result"
import {
    User,
    AuthToken,
    Space,
    SpaceMember,
    Invite,
    InviteStatus,
    SpaceRole
} from "./entities"

export enum ErrorCode {
    // Invalid request format
    InvalidRequest = "invalid_request",
    // User could not be authenticated, connection should be closed
    AuthenticationFailed = "auth_failed",
    // User doesn't have permission to perform the operation
    AccessDenied = "access_denied",
    // Operation cannot be performed
    UnprocessableRequest = "unprocessable_request",
    // Requested entity not found
    NotFound = "not_found",
    // Unexpected error
    InternalServerError = "internal_server_error"
}

export type RequestError = {
    code: ErrorCode
    message?: string
    details?: Object
}

type Models = {
    users: Repository<User>
    tokens: Repository<AuthToken>
    spaces: Repository<Space>
    members: Repository<SpaceMember>
    invites: Repository<Invite>
}

type CreateUserProps = {
    name: string
    password: string
}

type Profile = {
    id: string
    name: string
    spaces: { id: string; role: string }[]
}

const validateUsername = (name: string) => name.match(/^[a-z0-9_]+$/i) !== null

const validatePassword = (pwd: string) => pwd.match(/^[^\s]+$/i) !== null

class UserService {
    app: App

    constructor(app: App) {
        this.app = app
    }

    async create(
        models: Models,
        props: CreateUserProps
    ): Promise<ResultType<User, RequestError>> {
        const { name, password } = props
        if (!validateUsername(name) || !validatePassword(password)) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Incorrect name or password",
                details: {}
            })
        }

        const count = await models.users.countBy({ name })
        if (count > 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Username is already taken",
                details: { name }
            })
        }

        const data = { name, password, isDisabled: false }
        const res = await models.users.insert(data)
        const user = {
            name,
            isDisabled: false,
            ...res.generatedMaps[0]
        } as User

        const res2 = await this.app.services.spaces.create(models, {
            ownerId: user.id,
            name: name
        })
        if (!res2.isOk) return res2

        return Result.ok(user)
    }

    async delete(
        models: Models,
        id: string
    ): Promise<ResultType<true, RequestError>> {
        const count = await models.users.countBy({ id })
        if (count === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "User not found",
                details: { id }
            })
        }

        const spaces = await models.spaces.findBy({ ownerId: id })
        for (const i in spaces) {
            await this.app.services.spaces.delete(models, spaces[i].id)
        }
        await models.members.delete({ userId: id })
        await models.tokens.delete({ userId: id })
        await models.users.delete(id)

        return Result.ok(true)
    }

    async getProfile(
        models: Models,
        userId: string
    ): Promise<ResultType<Profile, RequestError>> {
        const user = await models.users.findOne({
            where: { id: userId, isDisabled: false },
            select: { id: true, name: true }
        })
        if (user === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "User not found",
                details: { userId }
            })
        }
        const getSpacesRes = await this.app.services.spaces.getUserSpaces(
            models,
            userId
        )
        if (!getSpacesRes.isOk) return getSpacesRes

        const profile = { ...user, spaces: getSpacesRes.value } as Profile
        return Result.ok(profile)
    }
}

type AuthTokenProps = {
    userId: string
    client?: string
    expiration?: number
}

type Credentials = {
    name: string
    password: string
}

const maxTokensPerUser = 10

class AuthService {
    app: App

    constructor(app: App) {
        this.app = app
    }

    isTokenExpired(token: AuthToken): boolean {
        const now = new Date()
        return token.expiresAt === null || token.expiresAt > now
    }

    async deleteExpiredTokens(models: Models, userId: string) {
        await models.tokens.delete({
            userId,
            expiresAt: Raw((f) => `${f} NOT NULL AND ${f} < TIME('now')`)
        })
    }

    async deleteTokensOverLimit(models: Models, userId: string) {
        const tokensOverLimit = await models.tokens.find({
            select: { token: true },
            where: { userId },
            order: { lastAccess: "DESC" },
            skip: maxTokensPerUser
        })
        if (tokensOverLimit.length) {
            await models.tokens.delete(tokensOverLimit.map((t) => t.token))
        }
    }

    async issueAuthToken(
        models: Models,
        props: AuthTokenProps
    ): Promise<ResultType<AuthToken, RequestError>> {
        const { userId, client, expiration } = props

        const count = await models.users.countBy({ id: userId })
        if (count === 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "User does not exist",
                details: { id: userId }
            })
        }

        const res = await models.tokens.insert({ userId })
        const token = { userId, ...res.generatedMaps[0] } as AuthToken

        this.deleteExpiredTokens(models, userId)
        this.deleteTokensOverLimit(models, userId)

        return Result.ok(token)
    }

    async authorizeWithPassword(
        models: Models,
        credentials: Credentials
    ): Promise<ResultType<AuthToken, RequestError>> {
        const { name, password } = credentials
        const user = await models.users.findOne({
            where: { name, isDisabled: false },
            select: { id: true, password: true }
        })
        if (user === null || user.password !== password) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Incorrect name or password",
                details: { name }
            })
        }
        const res = await this.issueAuthToken(models, { userId: user.id })
        return res
    }

    async deleteAuthToken(
        models: Models,
        token: string
    ): Promise<ResultType<true, RequestError>> {
        const res = await models.tokens.delete({ token })
        if (res.affected === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Token not found",
                details: { token }
            })
        } else {
            return Result.ok(true)
        }
    }

    async verifyAuthToken(
        models: Models,
        token: string
    ): Promise<ResultType<AuthToken | null, RequestError>> {
        const res = await models.tokens.findOne({
            where: { token },
            select: { token: true, userId: true, createdAt: true }
        })

        if (res === null) {
            return Result.ok(null)
        }

        if (this.isTokenExpired(res)) {
            models.tokens.delete({ token })
            return Result.ok(null)
        }

        models.tokens.update({ token }, { lastAccess: new Date() })

        return Result.ok(res)
    }

    async getUserTokens(
        models: Models,
        user: string
        // activeOnly: boolean = false
    ): Promise<ResultType<AuthToken[], RequestError>> {
        const count = await models.users.countBy({ id: user })
        if (count === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "User not found",
                details: { user }
            })
        }

        await this.deleteExpiredTokens(models, user)

        const tokens = await models.tokens.findBy({ userId: user })
        return Result.ok(tokens)
    }
}

type CreateSpaceProps = {
    ownerId: string
    name: string
}

type AddMemberProps = {
    userId: string
    spaceId: string
    role: SpaceRole
}

type SpaceView = {
    id: string
    name: string
    role: SpaceRole
    membersCount: number
    owner: { id: string }
}

class SpaceService {
    app: App

    constructor(app: App) {
        this.app = app
    }

    async exists(models: Models, id: string): Promise<boolean> {
        const count = await models.spaces.countBy({ id })
        return count === 1
    }

    async create(
        models: Models,
        props: CreateSpaceProps
    ): Promise<ResultType<SpaceView, RequestError>> {
        const { name, ownerId } = props
        const createRes = await models.spaces.insert({ name, ownerId })

        const space: SpaceView = {
            ...createRes.generatedMaps[0],
            name,
            owner: { id: ownerId } as User,
            role: "owner",
            membersCount: 1
        }

        const col = `spaces/${space.id}`

        await this.app.sinkron.createGroup(`${col}/readonly`)
        await this.app.sinkron.createGroup(`${col}/editor`)
        await this.app.sinkron.createGroup(`${col}/admin`)

        /*
        const p = new Permissions()
        p.add('group:${col}/readonly', [Permission.read])
        p.add('group:${col}/editor', [Permission.read, Permission.write])
        p.add('group:${col}/admin', [
            Permission.read,
            Permission.write,
            Permission.admin
        ])
        */

        await this.app.sinkron.createCollection(col)

        const meta = Automerge.from({ meta: true, categories: {} })
        await this.app.sinkron.createDocument(
            uuidv4(),
            col,
            Automerge.save(meta)
        )

        this.addMember(models, {
            userId: ownerId,
            spaceId: space.id,
            role: "owner"
        })

        return Result.ok(space)
    }

    async delete(models: Models, spaceId: string) {
        await models.members.delete({ spaceId })
        await models.invites.delete({ spaceId })
        const col = `spaces/${spaceId}`
        await this.app.sinkron.deleteCollection(col)
        await this.app.sinkron.deleteGroup(`${col}/readonly`)
        await this.app.sinkron.deleteGroup(`${col}/editor`)
        await this.app.sinkron.deleteGroup(`${col}/admin`)
        await models.spaces.delete({ id: spaceId })
    }

    async getMembers(models: Models, spaceId: string): Promise<User[]> {
        const res = await models.members.find({
            where: { spaceId },
            relations: { user: true },
            select: { user: { id: true, name: true }, role: true }
        })
        const members = res.map((m) => ({ role: m.role, ...m.user }))
        return members
    }

    async addMember(models: Models, props: AddMemberProps) {
        const { userId, spaceId, role } = props
        await models.members.insert({ userId, spaceId, role })
        await this.app.sinkron.addMemberToGroup(
            userId,
            `spaces/${spaceId}/${role}`
        )
    }

    async getUserSpaces(
        models: Models,
        userId: string
    ): Promise<ResultType<SpaceView[], RequestError>> {
        const res = await models.members.find({
            where: { userId },
            relations: ["space"],
            select: {
                spaceId: true,
                role: true,
                space: { id: true, ownerId: true, name: true }
            }
        })
        const spaces: SpaceView[] = res.map((m) => ({
            id: m.spaceId,
            name: m.space.name,
            role: m.role,
            membersCount: 0,
            owner: { id: m.space.ownerId }
        }))
        const membersCount = await models.members
            .createQueryBuilder()
            .select("COUNT(1)", "count")
            .addSelect("spaceId", "id")
            .where({ spaceId: In(spaces.map((s) => s.id)) })
            .groupBy("id")
            .getRawMany()
        membersCount.forEach((item) => {
            spaces.find((s) => s.id === item.id)!.membersCount = item.count
        })
        return Result.ok(spaces)
    }
}

interface CreateInviteProps {
    spaceId: string
    fromId: string
    toName: string
    role: "readonly" | "editor" | "admin"
}

// interface UpdateInviteProps {
// id: string
// role: "readonly" | "editor" | "admin"
// }

const inviteFindOptions = {
    select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        role: true,
        from: { id: true, name: true },
        to: { id: true, name: true },
        space: { id: true, name: true },
        notificationHidden: true
    },
    relations: { from: true, to: true, space: true }
}

class InviteService {
    constructor(app: App) {
        this.app = app
    }

    app: App

    async get(
        models: Models,
        id: string
    ): Promise<ResultType<Invite, RequestError>> {
        const res = await models.invites.findOne({
            where: { id },
            ...inviteFindOptions
        })
        if (res === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Invite not found",
                details: { id }
            })
        }
        return Result.ok(res)
    }

    async getSpaceActiveInvites(models: Models, spaceId: string) {
        const invites = await models.invites.find({
            where: { spaceId, status: "sent" },
            ...inviteFindOptions
        })
        return invites
    }

    async getUserActiveInvites(models: Models, userId: string) {
        const invites = await models.invites.find({
            where: [
                { toId: userId, status: "sent" },
                { fromId: userId, status: "sent" },
                {
                    fromId: userId,
                    status: Or(Equal("accepted"), Equal("declined")),
                    notificationHidden: false
                }
            ],
            ...inviteFindOptions
        })
        return invites
    }

    async create(
        models: Models,
        props: CreateInviteProps
    ): Promise<ResultType<Invite, RequestError>> {
        const { fromId, toName, spaceId, role } = props

        const fromMember = await models.members.findOne({
            where: { spaceId, userId: fromId },
            select: { role: true }
        })
        const isPermitted =
            fromMember !== null &&
            (role === "admin"
                ? fromMember.role === "owner"
                : ["admin", "owner"].includes(fromMember.role))
        if (!isPermitted) {
            return Result.err({
                code: ErrorCode.AccessDenied,
                message: "Not permitted",
                details: props
            })
        }

        const toUser = await models.users.findOne({
            where: { name: toName },
            select: { id: true }
        })
        if (toUser === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: `User with name "${toName}" not found`,
                details: props
            })
        }

        const count = await models.members.countBy({
            spaceId,
            userId: toUser.id
        })
        if (count !== 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "User already is a member",
                details: props
            })
        }

        // Only one active invite to space per user
        await models.invites.delete({
            spaceId,
            toId: toUser.id,
            status: "sent"
        })

        const data = {
            toId: toUser.id,
            fromId: fromId,
            spaceId,
            role,
            status: "sent" as InviteStatus,
            notificationHidden: false
        }
        const res = await models.invites.insert(data)
        const invite = { ...data, ...res.generatedMaps[0] } as Invite
        return Result.ok(invite)
    }
}

type AppProps = {
    sinkron: Sinkron
    dbPath: string
    host?: string
    port?: number
}

const defaultAppProps = {
    host: "0.0.0.0",
    port: 80
}

const timeout = (timeout: number) =>
    new Promise((resolve) => setTimeout(resolve, timeout))

const credentialsSchema = {
    type: "object",
    properties: {
        name: { type: "string", minLength: 1 },
        password: { type: "string", minLength: 1 }
    },
    required: ["name", "password"],
    additionalProperties: false
}

const loginRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.post(
        "/login",
        { schema: { body: credentialsSchema } },
        async (request, reply) => {
            const { name, password } = request.body
            // await timeout(1500)
            await app.transaction(async (models) => {
                const authRes = await app.services.auth.authorizeWithPassword(
                    models,
                    { name, password }
                )
                if (!authRes.isOk) {
                    reply
                        .clearCookie("token", { path: "/" })
                        .code(500)
                        .send({ error: authRes.error })
                    return
                }

                const token = authRes.value
                const profileRes = await app.services.users.getProfile(
                    models,
                    token.userId
                )
                if (!profileRes.isOk) {
                    reply
                        .clearCookie("token", { path: "/" })
                        .code(500)
                        .send({ error: { message: "Couldn't authorize" } })
                    return
                }

                reply
                    .setCookie("token", token.token, { path: "/" })
                    .send(profileRes.value)
            })
        }
    )

    fastify.post("/logout", async (request, reply) => {
        const token = request.cookies["token"]
        if (token !== undefined && token.length > 1) {
            await app.services.auth.deleteAuthToken(app.models, token)
        }
        reply.clearCookie("token").send()
    })

    fastify.post(
        "/signup",
        { schema: { body: credentialsSchema } },
        async (request, reply) => {
            const { name, password } = request.body
            // await timeout(1500)
            await app.transaction(async (models) => {
                const createRes = await app.services.users.create(models, {
                    name,
                    password
                })
                if (!createRes.isOk) {
                    reply.code(500).send({ error: createRes.error })
                    return
                }
                const userId = createRes.value.id

                const issueTokenRes = await app.services.auth.issueAuthToken(
                    models,
                    { userId }
                )
                if (!issueTokenRes.isOk) {
                    reply
                        .code(500)
                        .send({ error: { message: "Unknown error" } })
                }
                const token = issueTokenRes.value

                const getProfileRes = await app.services.users.getProfile(
                    models,
                    userId
                )
                if (!getProfileRes.isOk) {
                    reply.code(500)
                    return
                }
                reply
                    .setCookie("token", token.token, { path: "/" })
                    .send(getProfileRes.value)
            })
        }
    )
}

const spacesRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.post("/spaces/new", async (request, reply) => {
        const { name } = request.body
        await app.transaction(async (models) => {
            const res = await app.services.spaces.create(models, {
                name,
                ownerId: request.token.userId
            })
            if (!res.isOk) {
                reply.code(500).send(res.error)
            }
            reply.send(res.value)
        })
    })

    fastify.post("/spaces/:id/delete", async (request, reply) => {
        const { id } = request.params
        await app.transaction(async (models) => {
            const space = await models.spaces.findOne({
                where: { id },
                select: { ownerId: true }
            })
            if (space === null || space.ownerId !== request.token.userId) {
                reply.code(500)
                return
            }
            await app.services.spaces.delete(models, id)
            reply.send({})
        })
    })

    fastify.get("/spaces/:id/members", async (request, reply) => {
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
            reply.send(members)
        })
    })

    fastify.post("/spaces/:id/members/:member/update", () => {
        // update member of a space (change role)
        // TODO
    })

    fastify.post(
        "/spaces/:spaceId/members/:memberId/remove",
        async (request, reply) => {
            await app.transaction(async (models) => {
                const { spaceId, memberId } = request.params

                const member = await models.members.findOne({
                    where: { id: memberId, spaceId },
                    select: { userId: true, role: true }
                })
                if (member === null) {
                    reply.code(500).send()
                    return
                }

                const currentUserMember = await models.members.findOne({
                    where: { userId: request.token.userId, spaceId },
                    select: { role: true }
                })
                const isPermitted =
                    currentUserMember !== null &&
                    member.role !== "owner" &&
                    (member.role === "admin"
                        ? currentUserMember.role === "owner"
                        : ["admin", "owner"].includes(currentUserMember.role))
                if (!isPermitted) {
                    reply.code(500).send()
                    return
                }

                await models.members.delete({ id: memberId })
                reply.send({})
            })
        }
    )
}

const invitesRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.post("/invites/new", async (request, reply) => {
        const { spaceId, toName, role } = request.body
        await app.transaction(async (models) => {
            const res = await app.services.invites.create(models, {
                fromId: request.token.userId,
                spaceId,
                toName,
                role
            })
            if (!res.isOk) {
                reply.code(500).send({ error: res.error })
                return
            }
            reply.send(res.value)
        })
    })

    fastify.post("/invites/:id/update", async (request, reply) => {
        const { role } = request.body
        const { id } = request.params
        await app.transaction(async (models) => {
            const invite = await models.invites.findOne({
                where: { id, status: "sent" },
                select: { spaceId: true }
            })
            if (invite === null) {
                reply.code(500).send({ error: { message: "Invite not found" } })
                return
            }

            const member = await models.members.findOne({
                where: {
                    spaceId: invite.spaceId,
                    userId: request.token.userId
                },
                select: { role: true }
            })
            const isPermitted =
                member !== null &&
                (role === "admin"
                    ? member.role === "owner"
                    : ["admin", "owner"].includes(member.role))
            if (!isPermitted) {
                reply.code(500).send({ error: { message: "Not permitted" } })
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
    })

    fastify.post("/invites/:id/accept", async (request, reply) => {
        const id = request.params.id
        await app.transaction(async (models) => {
            const updateRes = await models.invites.update(
                { id, status: "sent", toId: request.token.userId },
                { status: "accepted" }
            )
            if (updateRes.affected === 0) {
                reply.code(500).send({ error: { message: "Invite not found" } })
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

            reply.send(invite)
        })
    })

    fastify.post("/invites/:id/decline", async (request, reply) => {
        const id = request.params.id
        await app.transaction(async (models) => {
            const updateRes = await models.invites.update(
                { id, status: "sent", toId: request.token.userId },
                { status: "declined" }
            )
            if (updateRes.affected === 0) {
                reply.code(500).send({ error: { message: "Invite not found" } })
                return
            }

            const inviteRes = await app.services.invites.get(models, id)
            if (!inviteRes.isOk) {
                reply.code(500).send()
                return
            }
            reply.send(inviteRes.value)
        })
    })

    fastify.post("/invites/:id/cancel", async (request, reply) => {
        const id = request.params.id
        await app.transaction(async (models) => {
            const invite = await models.invites.findOne({
                where: { id, status: "sent" },
                select: { spaceId: true }
            })
            if (invite === null) {
                reply.code(500).send({ error: { message: "Invite not found" } })
                return
            }

            const member = await models.members.findOne({
                where: {
                    spaceId: invite.spaceId,
                    userId: request.token.userId
                },
                select: { role: true }
            })
            if (member === null || !["admin", "owner"].includes(member.role)) {
                reply.code(500).send({ error: { message: "Not permitted" } })
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
    })

    fastify.post("/invites/:id/hide", async (request, reply) => {
        // TODO
    })
}

const appRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.addHook("preValidation", async (request, reply) => {
        const token = request.cookies["token"]
        if (token) {
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
        await app.transaction(async (models) => {
            const res = await app.services.users.getProfile(
                models,
                request.token.userId
            )
            if (!res.isOk) {
                reply.code(500).send({ error: { message: "Server error" } })
                return
            }
            reply.send(res.value)
        })
    })

    fastify.get("/notifications", async (request, reply) => {
        await app.transaction(async (models) => {
            const activeInvites =
                await app.services.invites.getUserActiveInvites(
                    models,
                    request.token.userId
                )
            reply.send(activeInvites)
        })
    })

    fastify.register(spacesRoutes(app))
    fastify.register(invitesRoutes(app))
}

type Services = {
    users: UserService
    auth: AuthService
    spaces: SpaceService
    invites: InviteService
}

class App {
    sinkron: Sinkron
    sinkronServer: SinkronServer
    fastify: FastifyInstance
    host: string
    port: number
    db: DataSource
    models: Models
    services: Services

    constructor(props: AppProps) {
        const { sinkron, host, port, dbPath } = { ...defaultAppProps, ...props }
        this.host = host
        this.port = port

        this.db = new DataSource({
            type: "better-sqlite3",
            database: dbPath,
            entities,
            synchronize: true,
            logging: ["error"]
        })

        this.models = {
            users: this.db.getRepository<User>("user"),
            tokens: this.db.getRepository<AuthToken>("token"),
            spaces: this.db.getRepository<Space>("space"),
            members: this.db.getRepository<SpaceMember>("space_member"),
            invites: this.db.getRepository<Invite>("invite")
        }

        this.services = {
            users: new UserService(this),
            auth: new AuthService(this),
            spaces: new SpaceService(this),
            invites: new InviteService(this)
        }

        this.sinkron = sinkron
        this.sinkronServer = new SinkronServer({ sinkron })

        this.fastify = this.createFastify()
    }

    async transaction<T>(cb: (models: Models) => Promise<T>) {
        return this.db.transaction((m) => {
            const models = {
                users: m.getRepository<User>("user"),
                tokens: m.getRepository<AuthToken>("token"),
                spaces: m.getRepository<Space>("space"),
                members: m.getRepository<SpaceMember>("space_member"),
                invites: m.getRepository<Invite>("invite")
            }
            return cb(models)
        })
    }

    async init() {
        await this.db.initialize()
    }

    async handleUpgrade(request: IncomingMessage, socket, head) {
        const token = request.url!.slice(1)
        const res = await this.services.auth.verifyAuthToken(this.models, token)
        if (res.isOk && res.value !== null) {
            this.sinkronServer.ws.handleUpgrade(request, socket, head, (ws) => {
                this.sinkronServer.ws.emit("connection", ws, request)
            })
        } else {
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
            socket.destroy()
            return
        }
    }

    createFastify() {
        const fastify = Fastify({
            serverFactory: (handler) => {
                const server = createServer(handler)
                server.on("upgrade", this.handleUpgrade.bind(this))
                return server
            }
        })

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
            }
        })

        fastify.register(fastifyCookie)
        fastify.register(loginRoutes(this))
        fastify.register(appRoutes(this))

        return fastify
    }

    start() {
        this.fastify.listen({ host: this.host, port: this.port }, (err) => {
            if (err) {
                console.log("Error while starting server:")
                console.log(err)
            } else {
                console.log(`Server started at ${this.host}:${this.port}`)
            }
        })
    }
}

export { App }
