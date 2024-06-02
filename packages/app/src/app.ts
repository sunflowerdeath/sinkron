import { createServer } from "http"
import type { IncomingMessage } from "http"
import { Duplex } from "stream"
import Fastify, { FastifyInstance, FastifyRequest } from "fastify"
import { DataSource, Raw, In, Or, Equal, Not, Repository } from "typeorm"
import { v4 as uuidv4 } from "uuid"
import * as Automerge from "@automerge/automerge"
import * as Bowser from "bowser"
import cors from "@fastify/cors"
import {
    Sinkron,
    SinkronServer,
    ChannelServer,
    Permissions,
    Action,
    Role
} from "sinkron"

import { Result, ResultType } from "./utils/result"
import dataSource from "./db/app"
import { dbPath as sinkronDbPath } from "./db/sinkron"
import {
    User,
    AuthToken,
    Space,
    SpaceMember,
    Invite,
    InviteStatus,
    SpaceRole
} from "./entities"

const authTokenHeader = "x-sinkron-auth-token"

// Except for "loginRoutes"
declare module "fastify" {
    interface FastifyRequest {
        token: AuthToken
    }
}

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
    details?: object
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
    hasUnreadNotifications: boolean
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
                message: "Incorrect name or password"
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

        const data = {
            name,
            password,
            isDisabled: false,
            hasUnreadNotifications: false
        }
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

    async setUnreadNotifications(
        models: Models,
        id: string,
        value: boolean = true
    ) {
        await models.users.update({ id }, { hasUnreadNotifications: value })
        if (value) this.app.channels.send(`users/${id}`, "notification")
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
            select: { id: true, name: true, hasUnreadNotifications: true }
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
        const { userId, client } = props // TODO expiration

        const count = await models.users.countBy({ id: userId })
        if (count === 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "User does not exist",
                details: { id: userId }
            })
        }

        const res = await models.tokens.insert({ userId, client })
        const token = { userId, ...res.generatedMaps[0] } as AuthToken

        this.deleteExpiredTokens(models, userId)
        this.deleteTokensOverLimit(models, userId)

        return Result.ok(token)
    }

    async authorizeWithPassword(
        models: Models,
        props: { client: string; credentials: Credentials }
    ): Promise<ResultType<AuthToken, RequestError>> {
        const { credentials, client } = props
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
        const res = await this.issueAuthToken(models, {
            userId: user.id,
            client
        })
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

    async deleteOtherTokens(
        models: Models,
        props: { userId: string; token: string }
    ) {
        const { token, userId } = props
        await models.tokens.delete({ token: Not(Equal(token)), userId })
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

    async getActiveTokens(
        models: Models,
        userId: string
    ): Promise<AuthToken[]> {
        await this.deleteExpiredTokens(models, userId)
        return await models.tokens.find({
            where: { userId },
            order: { lastAccess: "desc" }
        })
    }

    async getActiveSessions(
        models: Models,
        props: { userId: string; token: string }
    ): Promise<Session[]> {
        const { userId, token } = props
        const tokens = await this.getActiveTokens(models, userId)
        const sessions: Session[] = tokens.map((t) => {
            // const data = JSON.parse(t.client)
            return {
                lastActive: t.lastAccess.toISOString(),
                from: t.from,
                client: t.client,
                isCurrent: t.token === token
            }
        })
        return sessions
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

        const { id } = createRes.generatedMaps[0]
        const space: SpaceView = {
            id,
            name,
            owner: { id: ownerId } as User,
            role: "owner",
            membersCount: 1
        }

        const col = `spaces/${space.id}`

        await this.app.sinkron.createGroup(`${col}/readonly`)
        await this.app.sinkron.createGroup(`${col}/members`)

        const p = new Permissions()
        const members = Role.group(`${col}/members`)
        p.add(Action.read, members)
        p.add(Action.create, members)
        p.add(Action.update, members)
        p.add(Action.delete, members)
        const readonly = Role.group(`${col}/readonly`)
        p.add(Action.read, readonly)
        await this.app.sinkron.createCollection({
            id: col,
            permissions: p.table
        })

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
        await this.app.sinkron.deleteGroup(`${col}/members`)
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
        const group =
            `spaces/${spaceId}/` +
            (role === "readonly" ? "readonly" : "members")
        await this.app.sinkron.addMemberToGroup(userId, group)
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
        isHidden: true
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
                    isHidden: false
                }
            ],
            order: { updatedAt: "desc" },
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
                message: "Operation not permitted"
            })
        }

        const toUser = await models.users.findOne({
            where: { name: toName },
            select: { id: true }
        })
        if (toUser === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: `User "${toName}" not found`
            })
        }

        const count = await models.members.countBy({
            spaceId,
            userId: toUser.id
        })
        if (count !== 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: `User "${toName}" is already a member of the space`
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
            isHidden: false
        }
        const res = await models.invites.insert(data)
        const invite = { ...data, ...res.generatedMaps[0] } as Invite
        return Result.ok(invite)
    }
}

type AppProps = {
    host?: string
    port?: number
}

const defaultAppProps = {
    host: "0.0.0.0",
    port: 80
}

// const timeout = (timeout: number) =>
// new Promise((resolve) => setTimeout(resolve, timeout))

const credentialsSchema = {
    type: "object",
    properties: {
        name: { type: "string", minLength: 1 },
        password: { type: "string", minLength: 1 }
    },
    required: ["name", "password"],
    additionalProperties: false
}

interface LoginRouteBody {
    name: string
    password: string
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

const loginRoutes = (app: App) => async (fastify: FastifyInstance) => {
    fastify.post<{ Body: LoginRouteBody }>(
        "/login",
        { schema: { body: credentialsSchema } },
        async (request, reply) => {
            const { name, password } = request.body
            // await timeout(1500)
            await app.transaction(async (models) => {
                const authRes = await app.services.auth.authorizeWithPassword(
                    models,
                    {
                        credentials: { name, password },
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

    fastify.post<{ Body: LoginRouteBody }>(
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
                    return
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
                reply.send({ user: getProfileRes.value, token: token.token })
            })
        }
    )
}

interface Session {
    isCurrent: boolean
    lastActive: string
    from: string
    client: string
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

    fastify.post("/account/reset_password", async (request, reply) => {
        // TODO
    })
}

type SpaceCreateBody = { name: string }

const spaceCreateBodySchema = {
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
        { schema: { body: spaceCreateBodySchema } },
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
                    reply.code(500)
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

    fastify.post<{ Params: { spaceId: string; memberId: string } }>(
        "/spaces/:spaceId/members/:userId/remove",
        async (request, reply) => {
            await app.transaction(async (models) => {
                const { spaceId, userId } = request.params

                const member = await models.members.findOne({
                    where: { userId, spaceId },
                    select: { id: true, role: true }
                })
                if (member === null) {
                    reply
                        .code(500)
                        .send({ error: { message: "Member not found" } })
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
                    reply
                        .code(500)
                        .send({ error: { message: "Not permitted" } })
                    return
                }

                await models.members.delete({ id: member.id })
                reply.send({})
            })
        }
    )
}

type InviteCreateBody = {
    spaceId: string
    toName: string
    role: "readonly" | "editor" | "admin"
}

const inviteCreateBodySchema = {
    type: "object",
    properties: {
        spaceId: { type: "string", minLength: 1 },
        toName: { type: "string", minLength: 1 },
        role: { type: "string", minLength: 1 } // TODO one of
    },
    required: ["spaceId", "toName", "role"],
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
                const updateRes = await models.invites.update(
                    { id, status: "sent", toId: request.token.userId },
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

                // @ts-expect-error TODO
                invite.space.membersCount = await models.members.countBy({
                    spaceId: invite.spaceId
                })

                await app.services.spaces.addMember(models, {
                    userId: invite.to.id,
                    spaceId: invite.space.id,
                    role: invite.role
                })

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

                const member = await models.members.findOne({
                    where: {
                        spaceId: invite.spaceId,
                        userId: request.token.userId
                    },
                    select: { role: true }
                })
                if (
                    member === null ||
                    !["admin", "owner"].includes(member.role)
                ) {
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
    channels: ChannelServer
    fastify: FastifyInstance
    host: string
    port: number
    db: DataSource
    models: Models
    services: Services

    constructor(props: AppProps) {
        const { host, port } = { ...defaultAppProps, ...props }
        this.host = host
        this.port = port

        this.db = dataSource

        this.services = {
            users: new UserService(this),
            auth: new AuthService(this),
            spaces: new SpaceService(this),
            invites: new InviteService(this)
        }

        this.models = {
            users: this.db.getRepository<User>("user"),
            tokens: this.db.getRepository<AuthToken>("token"),
            spaces: this.db.getRepository<Space>("space"),
            members: this.db.getRepository<SpaceMember>("space_member"),
            invites: this.db.getRepository<Invite>("invite")
        }

        this.sinkron = new Sinkron({ dbPath: sinkronDbPath })
        this.sinkronServer = new SinkronServer({ sinkron: this.sinkron })

        this.channels = new ChannelServer({})

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
        await this.sinkron.init()
        await this.db.initialize()
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
