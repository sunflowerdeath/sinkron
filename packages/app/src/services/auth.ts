import { randomInt } from "node:crypto"
import { isAfter, addSeconds } from "date-fns"

import { Raw, Equal, Not } from "typeorm"

import { App, AppModels } from "../app"
import { AuthToken } from "../entities"

import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"
import { validateEmail } from "../utils/validations"

type AuthorizeWithCodeProps = {
    id: string
    code: string
    client: string
}

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

const maxOtpAttempts = 3
const otpLifeSpan = 30 * 60 // seconds
const maxTokensPerUser = 10

class AuthService {
    app: App
    lastCode: string = "" // for testing

    constructor(app: App) {
        this.app = app
    }

    isTokenExpired(token: AuthToken): boolean {
        const now = new Date()
        return token.expiresAt === null || token.expiresAt > now
    }

    async deleteExpiredTokens(models: AppModels, userId: string) {
        const now =
            this.app.config.db.type === "postgres" ? "NOW()" : "TIME('now')"
        await models.tokens.delete({
            userId,
            expiresAt: Raw((f) => `${f} IS NOT NULL AND ${f} < ${now}`)
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

    async sendCode(
        models: AppModels,
        email: string
    ): Promise<ResultType<{ id: string }, RequestError>> {
        const valid = validateEmail(email)
        if (!valid) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Invalid email"
            })
        }

        const code = randomInt(100000, 999999).toString()
        const html = `Enter this code on the sign-in page:<br/><b>${code}</b>`
        this.lastCode = code
        const text = `Enter this code on the sign-in page:\n${code}`
        const res = await this.app.emailSender.send({
            from: "admin@mail.sinkron.xyz",
            sender: "Sinkron",
            to: email,
            subject: "Sinkron Verification Code",
            text,
            html
        })
        if (!res.isOk) {
            return Result.err({
                code: ErrorCode.InternalServerError,
                message: "Couldn't send email"
            })
        }

        const res2 = await models.otps.insert({ code, email, attempts: 0 })
        const id = res2.generatedMaps[0].id
        return Result.ok({ id })
    }

    async authorizeWithCode(
        models: AppModels,
        props: AuthorizeWithCodeProps
    ): Promise<ResultType<AuthToken, RequestError>> {
        const { id, code, client } = props

        const otp = await models.otps.findOne({
            where: { id },
            select: {
                email: true,
                code: true,
                createdAt: true,
                attempts: true
            }
        })

        if (otp === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Code not found. Generate new code.",
                details: { error: "not_found" }
            })
        }

        const expiresAt = addSeconds(otp.createdAt, otpLifeSpan)
        if (isAfter(new Date(), expiresAt)) {
            await models.otps.delete({ id })
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Code is expired. Generate new code.",
                details: { error: "is_expired" }
            })
        }

        if (otp.code !== code) {
            if (otp.attempts + 1 >= maxOtpAttempts) {
                await models.otps.delete({ id })
                return Result.err({
                    code: ErrorCode.InvalidRequest,
                    message: "Too many attempts. Generate new code.",
                    details: { error: "too_many_attempts" }
                })
            } else {
                await models.otps.update(
                    { id },
                    { attempts: () => "attempts + 1" }
                )
                return Result.err({
                    code: ErrorCode.InvalidRequest,
                    message: "Incorrect code",
                    details: { error: "incorrect_code" }
                })
            }
        }

        await models.otps.delete({ id })

        const user = await models.users.findOne({
            where: { email: otp.email },
            select: { id: true }
        })

        let userId: string
        if (user !== null) {
            userId = user.id
        } else {
            const createRes = await this.app.services.users.create(
                models,
                otp.email
            )
            if (!createRes.isOk) return createRes
            userId = createRes.value.id
        }

        const res = await this.issueAuthToken(models, { userId, client })
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
