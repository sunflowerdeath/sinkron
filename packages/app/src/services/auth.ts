import { Raw, Equal, Not } from "typeorm"

import { App, AppModels } from "../app"
import { AuthToken } from "../entities"

import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"

import { ajv } from "../ajv"
import { credentialsSchema } from "../schemas/credentials"

type AuthTokenProps = {
    userId: string
    client?: string
    expiration?: number
}

type Session = {
    isCurrent: boolean
    lastActive: string
    from: string
    client: string
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

    async deleteExpiredTokens(models: AppModels, userId: string) {
        await models.tokens.delete({
            userId,
            expiresAt: Raw((f) => `${f} NOT NULL AND ${f} < TIME('now')`)
        })
    }

    async deleteTokensOverLimit(models: AppModels, userId: string) {
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
        models: AppModels,
        props: AuthTokenProps
    ): Promise<ResultType<AuthToken, RequestError>> {
        const { userId, client } = props // TODO issue with expiration

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
        models: AppModels,
        props: { client: string; credentials: Credentials }
    ): Promise<ResultType<AuthToken, RequestError>> {
        const { credentials, client } = props

        if (!credentialsSchema(credentials)) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Invalid name or password",
                details: { errors: ajv.errorsText(credentialsSchema.errors) }
            })
        }

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
        models: AppModels,
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
        models: AppModels,
        props: { userId: string; token: string }
    ) {
        const { token, userId } = props
        await models.tokens.delete({ token: Not(Equal(token)), userId })
    }

    async verifyAuthToken(
        models: AppModels,
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
        models: AppModels,
        userId: string
    ): Promise<AuthToken[]> {
        await this.deleteExpiredTokens(models, userId)
        return await models.tokens.find({
            where: { userId },
            order: { lastAccess: "desc" }
        })
    }

    async getActiveSessions(
        models: AppModels,
        props: { userId: string; token: string }
    ): Promise<Session[]> {
        const { userId, token } = props
        const tokens = await this.getActiveTokens(models, userId)
        const sessions: Session[] = tokens.map((t) => {
            // const data = JSON.parse(t.client)
            return {
                lastActive: t.lastAccess.toISOString(),
                from: "", // TODO t.from,
                client: t.client,
                isCurrent: t.token === token
            }
        })
        return sessions
    }
}

export { AuthService }
