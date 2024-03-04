import { DataSource, Repository, Or, Equal } from "typeorm"

import { Result, ResultType } from "../utils/result"

import { Invite, InviteStatus, SpaceRole } from "../entities"
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

class InvitesController {
    constructor(db: DataSource, c: Controller) {
        this.db = db
        this.controller = c
        this.invites = db.getRepository("invite")
    }

    db: DataSource
    controller: Controller
    invites: Repository<Invite>

    async create(
        data: CreateInvitePayload
    ): Promise<ResultType<Invite, RequestError>> {
        const res = await this.invites.insert({
            ...data,
            status: "sent",
            notificationHidden: false
        })

        const invite = {
            ...data,
            ...res.generatedMaps[0]
        } as Invite
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
        return Result.ok(true)
    }

    async accept(id: string): Promise<ResultType<true, RequestError>> {
        const invite = await this.invites.findOne({
            where: { id, status: "sent" },
            select: { id: true, toId: true, spaceId: true, role: true }
        })
        if (invite === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                details: { id },
                message: "Invite not found"
            })
        }
        await this.invites.update({ id }, { status: "accepted" })
        const res = await this.controller.spaces.addMember({
            userId: invite.toId,
            spaceId: invite.spaceId,
            role: invite.role
        })
        if (!res.isOk) return res
        return Result.ok(true)
    }

    async decline(id: string): Promise<ResultType<true, RequestError>> {
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
        return Result.ok(true)
    }

    async cancel(id: string): Promise<ResultType<true, RequestError>> {
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
        return Result.ok(true)
    }

    async hideNotification(
        id: string
    ): Promise<ResultType<true, RequestError>> {
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
        return Result.ok(true)
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
            select: {
                id: true,
                status: true
            },
            relations: {
                from: true,
                to: true,
                space: true
            }
        })
        return Result.ok(notifications)
    }
}

export { InvitesController }
