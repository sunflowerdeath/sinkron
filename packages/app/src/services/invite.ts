import { Or, Equal } from "typeorm"

import { App, AppModels } from "../app"
import { Invite, InviteStatus } from "../entities"

import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"

// import { ajv } from "../ajv"
// import { credentialsSchema } from "../schemas/credentials"

export type CreateInviteProps = {
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
        models: AppModels,
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

    async getSpaceActiveInvites(models: AppModels, spaceId: string) {
        const invites = await models.invites.find({
            where: { spaceId, status: "sent" },
            ...inviteFindOptions
        })
        return invites
    }

    async getUserActiveInvites(models: AppModels, userId: string) {
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
        models: AppModels,
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

export { InviteService }
