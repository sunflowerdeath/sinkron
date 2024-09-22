import { createHash } from "node:crypto"

import { App, AppModels } from "../app"
import { User } from "../entities"

import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"

import { ajv } from "../ajv"
import { credentialsSchema } from "../schemas/credentials"

export type CreateUserProps = {
    name: string
    password: string
    email: string
}

export type Profile = {
    id: string
    name: string
    spaces: { id: string; role: string }[]
    hasUnreadNotifications: boolean
}

const EMAIL_CONFIRMATION_SECRET = "test"

const makeEmailConfirmationToken = (userId: string, email: string) =>
    createHash("sha256")
        .update(userId + email + EMAIL_CONFIRMATION_SECRET)
        .digest("hex")

class UserService {
    app: App

    constructor(app: App) {
        this.app = app
    }

    async create(
        models: AppModels,
        props: CreateUserProps
    ): Promise<ResultType<User, RequestError>> {
        const { name, password, email } = props

        if (!credentialsSchema(props)) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Invalid registration data",
                details: { errors: ajv.errorsText(credentialsSchema.errors) }
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

        const usersWithSuchEmail = await models.users.countBy({
            email,
            emailIsConfirmed: true
        })
        if (usersWithSuchEmail > 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Email-address is already used by another user",
                details: { email }
            })
        }

        const data = {
            name,
            password,
            email,
            emailIsConfirmed: false,
            emailConfirmationsSent: 0,
            emailConfirmationSentAt: null,
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

    async sendConfirmationEmail(
        models: AppModels,
        userId: string
    ): Promise<ResultType<true, RequestError>> {
        const user = await models.users.findOne({
            where: { id: userId },
            select: {
                email: true,
                emailIsConfirmed: true,
                emailConfirmationsSent: true
            }
        })

        if (!user) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "User not found"
            })
        }

        if (user.email === null) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "User email is not set"
            })
        }

        if (user.emailIsConfirmed) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Email is already confirmed"
            })
        }

        if (user.emailConfirmationsSent >= 3) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Too much confirmations sent"
            })
        }

        const token = makeEmailConfirmationToken(userId, user.email)
        const confirmationUrl =
            "https://sinkron.xyz/confirm-email" +
            `?userId=${userId}&token=${token}`
        const html = `
            Confirm your email by clicking this link:<br/>
            <a href="${confirmationUrl}">${confirmationUrl}</a>`
        const text =
            "Confirm your email by clicking this link:\n" + confirmationUrl

        const res = await this.app.emailSender.send({
            from: "admin@mail.sinkron.xyz",
            sender: "Sinkron",
            subject: "Confirm email",
            text,
            html
        })
        if (!res.isOk) {
            return Result.err({
                code: ErrorCode.InternalServerError,
                message: "Couldn't send email"
            })
        }

        await models.users.update(
            { id: userId },
            { emailConfirmationsSent: () => "email_confirmations_sent + 1" }
        )
        return Result.ok(true)
    }

    async confirmEmail(
        models: AppModels,
        userId: string,
        token: string
    ): Promise<ResultType<boolean, RequestError>> {
        const user = await models.users.findOne({
            where: { id: userId },
            select: { email: true, emailIsConfirmed: true }
        })

        const confirmed =
            user !== null &&
            user.email !== null &&
            !user.emailIsConfirmed &&
            token === makeEmailConfirmationToken(userId, user.email)

        if (!confirmed) return Result.ok(false)

        await models.users.update(userId, { emailIsConfirmed: true })
        return Result.ok(true)
    }

    async setUnreadNotifications(
        models: AppModels,
        id: string,
        value: boolean = true
    ) {
        await models.users.update({ id }, { hasUnreadNotifications: value })
        if (value) this.app.channels.send(`users/${id}`, "notification")
    }

    async delete(
        models: AppModels,
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
        models: AppModels,
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

export { UserService }
