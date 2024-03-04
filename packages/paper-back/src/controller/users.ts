import { EntitySchema, DataSource, Repository } from "typeorm"
import { Raw } from "typeorm"

import { AuthToken, User, Space, SpaceRole, SpaceMember } from "../entities"
import { Result, ResultType } from "../utils/result"
import { Controller } from "./index"

export enum ErrorCode {
    // Invalid request format
    InvalidRequest = "invalid_request",

    // User could not be authenticated, connection will be closed
    AuthenticationFailed = "auth_failed",

    // User doesn't have permission to perform the operation
    AccessDenied = "access_denied",

    // Operation cannot be performed
    UnprocessableRequest = "unprocessable_request",

    // Requested entity not found
    NotFound = "not_found",

    InternalServerError = "internal_server_error"
}

type RequestError = {
    code: ErrorCode
    details: Object
    message: string
}

const maxTokensPerUser = 10

type AuthTokenProps = {
    userId: string
    client?: string
    expiration?: number
}

type Profile = {
    id: string
    name: string
    spaces: { id: string; role: string }[]
}

const validateUsername = (name: string) => name.match(/^[a-z0-9_]+$/i) !== null
const validatePassword = (pwd: string) => pwd.match(/^[^\s]+$/i) !== null

class UsersController {
    constructor(db: DataSource, c: Controller) {
        this.controller = c
        this.db = db
        this.users = db.getRepository("user")
        this.tokens = db.getRepository("token")
    }

    controller: Controller
    db: DataSource
    users: Repository<User>
    tokens: Repository<AuthToken>

    async createUser(
        name: string,
        password: string
    ): Promise<ResultType<User, RequestError>> {
        if (!validateUsername(name) || !validatePassword(password)) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Incorrect name or password",
                details: {}
            })
        }

        const count = await this.users.countBy({ name })
        if (count > 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Username is already taken",
                details: { name }
            })
        }

        const data = { name, password, isDisabled: false }
        const res = await this.users.insert(data)
        const user = {
            name,
            isDisabled: false,
            ...res.generatedMaps[0]
        } as User

        const res2 = await this.controller.spaces.create({
            ownerId: user.id,
            name: name
        })
        if (!res2.isOk) return res2

        return Result.ok(user)
    }

    async deleteUser(id: string): Promise<ResultType<true, RequestError>> {
        const count = await this.users.countBy({ id })
        if (count === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "User not found",
                details: { id }
            })
        }

        // delete spaces
        const spaces = await this.db
            .getRepository<Space>("space")
            .findBy({ ownerId: id })
        for (let i in spaces) {
            await this.controller.spaces.delete(spaces[i].id)
        }

        // delete memebers
        await this.db
            .getRepository<SpaceMember>("space_member")
            .delete({ userId: id })

        // delete auth tokens
        await this.tokens.delete({ userId: id })

        await this.users.delete(id)

        return Result.ok(true)
    }

    async getUser(id: string): Promise<ResultType<User | null, RequestError>> {
        const user = await this.users.findOne({
            where: { id },
            select: { id: true }
        })
        return Result.ok(user)
    }

    isTokenExpired(token: AuthToken): boolean {
        const now = new Date()
        return token.expiresAt === null || token.expiresAt > now
    }

    async _deleteExpiredTokens(user: string) {
        await this.tokens.delete({
            userId: user,
            expiresAt: Raw((f) => `${f} NOT NULL AND ${f} < TIME('now')`)
        })
    }

    async _deleteTokensOverLimit(user: string) {
        const tokensOverLimit = await this.tokens.find({
            select: { token: true },
            where: { userId: user },
            order: { lastAccess: "DESC" },
            skip: maxTokensPerUser
        })
        if (tokensOverLimit.length) {
            await this.tokens.delete(tokensOverLimit.map((t) => t.token))
        }
    }

    async issueAuthToken(
        props: AuthTokenProps
    ): Promise<ResultType<AuthToken, RequestError>> {
        const { userId, client, expiration } = props

        const count = await this.users.countBy({ id: userId })
        if (count === 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "User does not exist",
                details: { id: userId }
            })
        }

        const res = await this.tokens.insert({ userId })
        const token = { userId, ...res.generatedMaps[0] } as AuthToken

        this._deleteExpiredTokens(userId)
        this._deleteTokensOverLimit(userId)

        return Result.ok(token)
    }

    async deleteToken(token: string): Promise<ResultType<true, RequestError>> {
        const res = await this.tokens.delete({ token })
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
        token: string
    ): Promise<ResultType<AuthToken | null, RequestError>> {
        const res = await this.tokens.findOne({
            where: { token },
            select: { token: true, userId: true, createdAt: true }
        })

        if (res === null) {
            return Result.ok(null)
        }

        if (this.isTokenExpired(res)) {
            this.tokens.delete({ token })
            return Result.ok(null)
        }

        this.tokens.update({ token }, { lastAccess: new Date() })

        return Result.ok(res)
    }

    async getUserTokens(
        user: string,
        activeOnly: boolean = false
    ): Promise<ResultType<AuthToken[], RequestError>> {
        const count = await this.users.countBy({ id: user })
        if (count === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "User not found",
                details: { user }
            })
        }

        await this._deleteExpiredTokens(user)

        const tokens = await this.tokens.findBy({ userId: user })
        return Result.ok(tokens)
    }

    async authorizeWithPassword(
        name: string,
        password: string
    ): Promise<ResultType<AuthToken, RequestError>> {
        const user = await this.users.findOne({
            where: { name, isDisabled: false },
            select: { id: true, password: true }
        })
        if (user === null || user.password !== password) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Incorrect name or password",
                details: { user }
            })
        }

        const res = await this.issueAuthToken({ userId: user.id })
        return res
    }

    async getUserProfile(
        id: string
    ): Promise<ResultType<Profile, RequestError>> {
        const user = await this.users.findOne({
            where: { id, isDisabled: false },
            select: { id: true, name: true }
        })

        if (user === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "User not found",
                details: { id }
            })
        }
        const getSpacesRes = await this.controller.spaces.getUserSpaces(user.id)
        if (!getSpacesRes.isOk) return getSpacesRes

        const profile = { ...user, spaces: getSpacesRes.value! } as Profile
        return Result.ok(profile)
    }
}

export { UsersController }
