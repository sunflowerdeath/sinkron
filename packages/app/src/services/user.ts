import { App, AppModels } from "../app"
import { User } from "../entities"

import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"
import { validateEmail } from "../utils/validations"
import { Picture } from "../types"

export type Profile = {
    id: string
    email: string
    picture: Picture
    spaces: { id: string; picture: Picture, role: string }[]
    hasUnreadNotifications: boolean
}

class UserService {
    app: App

    constructor(app: App) {
        this.app = app
    }

    async create(
        models: AppModels,
        email: string
    ): Promise<ResultType<User, RequestError>> {
        if (!validateEmail(email)) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Invalid email"
            })
        }

        const count = await models.users.countBy({ email })
        if (count > 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Email-address is already used by another user",
                details: { email }
            })
        }

        const data = {
            email,
            isDisabled: false,
            hasUnreadNotifications: false
        }
        const res = await models.users.insert(data)
        const user = {
            email,
            isDisabled: false,
            ...res.generatedMaps[0]
        } as User

        const createSpaceRes = await this.app.services.spaces.create(models, {
            ownerId: user.id,
            name: email
        })
        if (!createSpaceRes.isOk) return createSpaceRes

        return Result.ok(user)
    }

    async setUnreadNotifications(
        models: AppModels,
        userId: string,
        value: boolean = true
    ) {
        await models.users.update(
            { id: userId },
            { hasUnreadNotifications: value }
        )
        if (value) this.app.channels.send(`users/${userId}`, "notification")
    }

    async delete(
        models: AppModels,
        userId: string
    ): Promise<ResultType<true, RequestError>> {
        const count = await models.users.countBy({ id: userId })
        if (count === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "User not found",
                details: { id: userId }
            })
        }

        const spaces = await models.spaces.findBy({ ownerId: userId })
        for (const i in spaces) {
            await this.app.services.spaces.delete(models, spaces[i].id)
        }
        await models.members.delete({ userId })
        await models.tokens.delete({ userId })
        await models.users.delete(userId)

        return Result.ok(true)
    }

    async setPicture(
        models: AppModels,
        userId: string,
        picture: Picture
    ): Promise<ResultType<true, RequestError>> {
        const res = await models.users.update(
            { id: userId, isDisabled: false },
            { picture: JSON.stringify(picture) }
        )
        if (res.affected === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "User not found",
                details: { userId }
            })
        }
        return Result.ok(true)
    }

    async getProfile(
        models: AppModels,
        userId: string
    ): Promise<ResultType<Profile, RequestError>> {
        const user = await models.users.findOne({
            where: { id: userId, isDisabled: false },
            select: {
                id: true,
                email: true,
                picture: true,
                hasUnreadNotifications: true
            }
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

        const profile = {
            ...user,
            picture: JSON.parse(user.picture),
            spaces: getSpacesRes.value
        } as Profile
        return Result.ok(profile)
    }
}

export { UserService }
