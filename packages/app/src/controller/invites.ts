import { DataSource, Repository, Or, Equal } from "typeorm"

import { Result, ResultType } from "../utils/result"

import { User, Space, Invite, SpaceMember } from "../entities"

import { Controller, ErrorCode } from "./index"
import type { RequestContext, RequestError } from "./index"

interface CreateInviteProps {
    spaceId: string
    fromId: string
    toId: string
    role: "readonly" | "editor" | "admin"
}

interface UpdateInviteProps {
    id: string
    role: "readonly" | "editor" | "admin"
}

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

class InvitesController {
    constructor(db: DataSource, c: Controller) {
        this.db = db
        this.controller = c

        this.users = db.getRepository("user")
        this.spaces = db.getRepository("space")
        this.invites = db.getRepository("invite")
        this.members = db.getRepository("space_member")
    }

    db: DataSource
    controller: Controller

    users: Repository<User>
    spaces: Repository<Space>
    invites: Repository<Invite>
    members: Repository<SpaceMember>

    async get(id: string): Promise<ResultType<Invite, RequestError>> {
        const res = await this.invites.findOne({
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

    async getSpaceActiveInvites(spaceId: string) {
        const notifications = await this.invites.find({
            where: { spaceId, status: "sent" },
            ...inviteFindOptions
        })
        return Result.ok(notifications)
    }

    async create(
        props: CreateInviteProps
    ): Promise<ResultType<Invite, RequestError>> {
        const { fromId, toId, spaceId, role } = props

        const userCount = await this.users.countBy({ id: toId })
        const invitedByMember = await this.members.findOne({
            where: { spaceId, userId: fromId },
            select: { role: true }
        })
        if (userCount !== 1 || invitedByMember === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Couldn't create invite",
                details: props
            })
        }

        const count = await this.members.countBy({ spaceId, userId: toId })
        if (count !== 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "User already is a member",
                details: props
            })
        }

        const isPermitted =
            role === "admin"
                ? invitedByMember.role === "owner"
                : ["admin", "owner"].includes(invitedByMember.role)
        if (!isPermitted) {
            return Result.err({
                code: ErrorCode.AccessDenied,
                message: "Couldn't create invite",
                details: props
            })
        }

        // Only one active invite to space per user
        await this.invites.delete({ spaceId, toId, status: "sent" })

        const res = await this.invites.insert({
            ...props,
            status: "sent",
            notificationHidden: false
        })

        const invite = { ...props, ...res.generatedMaps[0] } as Invite
        return Result.ok(invite)
    }

    // Request Handlers

    async getUserActiveNotificationsHandler(ctx: RequestContext) {
        const userId = ctx.token.userId
        const notifications = await this.invites.find({
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
        return Result.ok(notifications)
    }
}

export { InvitesController }
