import { DataSource, Repository, Or, Equal } from "typeorm"

import { Result, ResultType } from "../utils/result"

import {
    User,
    Space,
    Invite,
    InviteStatus,
    SpaceMember,
    SpaceRole
} from "../entities"
import { Controller } from "./index"

enum ErrorCode {
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

interface CreateInvitePayload {
    fromId: string
    toId: string
    spaceId: string
    role: SpaceRole
}

interface UpdateInvitePayload {
    role: SpaceRole
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

    async create(
        data: CreateInvitePayload
    ): Promise<ResultType<Invite, RequestError>> {
        const { toId, fromId, spaceId } = data

        const usersCount = await this.users.countBy({
            id: Or(Equal(toId), Equal(fromId))
        })
        const spaceCount = await this.spaces.countBy({ id: spaceId })
        const member = await this.members.findOne({
            where: { spaceId, userId: fromId },
            select: { role: true }
        })
        if (usersCount !== 2 || spaceCount !== 1 || member === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Couldn't create invite",
                details: data
            })
        }

        const count = await this.members.countBy({ spaceId, userId: toId })
        if (count !== 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "User already is a member",
                details: data
            })
        }

        const isPermitted =
            data.role === "admin"
                ? member.role === "owner"
                : member.role === "admin" || member.role === "owner"
        if (!isPermitted) {
            return Result.err({
                code: ErrorCode.AccessDenied,
                message: "Couldn't create invite",
                details: data
            })
        }

        // Only one active invite to space per user
        await this.invites.delete({ spaceId, toId, status: "sent" })

        const res = await this.invites.insert({
            ...data,
            status: "sent",
            notificationHidden: false
        })

        const invite = { ...data, ...res.generatedMaps[0] } as Invite
        return Result.ok(invite)
    }

    async update(id: string, data: UpdateInvitePayload) {
        const updateRes = await this.invites.update(
            { id, status: "sent" },
            data
        )
        if (updateRes.affected === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                details: { id },
                message: "Invite not found"
            })
        }

        return await this.get(id)
    }

    async accept(id: string): Promise<ResultType<Invite, RequestError>> {
        const updateRes = await this.invites.update(
            { id, status: "sent" },
            { status: "accepted" }
        )
        if (updateRes.affected === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                details: { id },
                message: "Invite not found"
            })
        }

        const inviteRes = await this.get(id)
        if (!inviteRes.isOk) return inviteRes
        const invite = inviteRes.value

        const res = await this.controller.spaces.addMember({
            userId: invite.to.id,
            spaceId: invite.space.id,
            role: invite.role
        })
        if (!res.isOk) return res

        return Result.ok(invite)
    }

    async decline(id: string): Promise<ResultType<Invite, RequestError>> {
        const updateRes = await this.invites.update(
            { id, status: "sent" },
            { status: "declined" }
        )
        if (updateRes.affected === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                details: { id },
                message: "Invite not found"
            })
        }

        return await this.get(id)
    }

    async cancel(id: string): Promise<ResultType<Invite, RequestError>> {
        const updateRes = await this.invites.update(
            { id, status: "sent" },
            { status: "cancelled" }
        )
        if (updateRes.affected === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                details: { id },
                message: "Invite not found"
            })
        }

        return await this.get(id)
    }

    async hideNotification(
        id: string
    ): Promise<ResultType<Invite, RequestError>> {
        const updateRes = await this.invites.update(
            { id },
            { notificationHidden: true }
        )
        if (updateRes.affected === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                details: { id },
                message: "Invite not found"
            })
        }

        return await this.get(id)
    }

    async getActiveNotifications(userId: string) {
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
