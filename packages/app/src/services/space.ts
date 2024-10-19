import { In } from "typeorm"
import { v4 as uuidv4 } from "uuid"
import * as Automerge from "@automerge/automerge"
import { Permissions, Action, Role } from "sinkron"

import { App, AppModels } from "../app"
import { User, SpaceRole } from "../entities"

import { ajv } from "../ajv"

import { Result, ResultType } from "../utils/result"
import { ErrorCode, RequestError } from "../error"

export type CreateSpaceProps = {
    ownerId: string
    name: string
}

export type AddMemberProps = {
    userId: string
    spaceId: string
    role: SpaceRole
}

export type SpaceView = {
    id: string
    name: string
    role: SpaceRole
    usedStorage: number
    membersCount: number
    owner: { id: string }
}

export type SpaceMemberView = {
    id: string
    email: string
    role: string
}

export type LockDocumentProps = {
    spaceId: string
    docId: string
    lock: boolean
}

const spaceNameSchema = ajv.compile({
    type: "string",
    minLength: 1,
    maxLength: 100
})

class SpaceService {
    app: App

    constructor(app: App) {
        this.app = app
    }

    async exists(models: AppModels, id: string): Promise<boolean> {
        const count = await models.spaces.countBy({ id })
        return count === 1
    }

    async create(
        models: AppModels,
        props: CreateSpaceProps
    ): Promise<ResultType<SpaceView, RequestError>> {
        const { name, ownerId } = props

        if (!spaceNameSchema(name)) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Invalid name",
                details: { errors: ajv.errorsText(spaceNameSchema.errors) }
            })
        }

        const insertRes = await models.spaces.insert({ name, ownerId })
        const { id } = insertRes.generatedMaps[0]
        const space: SpaceView = {
            id,
            name,
            owner: { id: ownerId } as User,
            role: "owner",
            membersCount: 1,
            usedStorage: 0
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

        // TODO create in transaction, throw if sinkron failed

        await this.addMember(models, {
            userId: ownerId,
            spaceId: space.id,
            role: "owner"
        })

        return Result.ok(space)
    }

    async delete(
        models: AppModels,
        spaceId: string
    ): Promise<ResultType<true, RequestError>> {
        const files = await models.files.find({
            where: { spaceId },
            select: { id: true }
        })
        if (files.length > 0) {
            const ids = files.map((f) => f.id)
            await this.app.storage.batchDelete(ids)
        }
        await models.files.delete({ spaceId })
        await models.posts.delete({ spaceId })
        await models.members.delete({ spaceId })
        await models.invites.delete({ spaceId })
        await models.spaces.delete({ id: spaceId })
        const col = `spaces/${spaceId}`
        await this.app.sinkron.deleteCollection(col)
        await this.app.sinkron.deleteGroup(`${col}/readonly`)
        await this.app.sinkron.deleteGroup(`${col}/members`)
        return Result.ok(true)
    }

    async rename(
        models: AppModels,
        spaceId: string,
        name: string
    ): Promise<ResultType<true, RequestError>> {
        if (!spaceNameSchema(name)) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Invalid name",
                details: { errors: ajv.errorsText(spaceNameSchema.errors) }
            })
        }
        await models.spaces.update(spaceId, { name })
        return Result.ok(true)
    }

    async getMembers(
        models: AppModels,
        spaceId: string
    ): Promise<SpaceMemberView[]> {
        const res = await models.members.find({
            where: { spaceId },
            relations: { user: true },
            select: { user: { id: true, email: true }, role: true }
        })
        return res.map((m) => ({ role: m.role, ...m.user }))
    }

    async addMember(models: AppModels, props: AddMemberProps) {
        const { userId, spaceId, role } = props
        await models.members.insert({ userId, spaceId, role })
        const group =
            `spaces/${spaceId}/` +
            (role === "readonly" ? "readonly" : "members")
        await this.app.sinkron.addMemberToGroup(userId, group)
    }

    async getMemberRole(
        models: AppModels,
        props: { spaceId: string; userId: string }
    ): Promise<SpaceRole | null> {
        const { userId, spaceId } = props
        const member = await models.members.findOne({
            where: { userId, spaceId },
            select: { role: true }
        })
        return member ? member.role : null
    }

    async checkMemberRole(props: {
        spaceId: string
        userId: string
        roles: SpaceRole[]
    }) {
        const models = this.app.models
        const { spaceId, userId, roles } = props
        const role = await this.getMemberRole(models, { spaceId, userId })
        return role !== null && roles.includes(role)
    }

    async getMember(props: {
        spaceId: string
        userId: string
    }): Promise<SpaceMemberView | null> {
        const { userId, spaceId } = props
        const member = await this.app.models.members.findOne({
            where: { userId, spaceId },
            relations: { user: true },
            select: { id: true, role: true, user: { id: true, email: true } }
        })
        if (member === null) return null
        return { role: member.role, id: userId, email: member.user.email }
    }

    async changeMemberRole(props: {
        spaceId: string
        userId: string
        role: SpaceRole
    }): Promise<ResultType<SpaceMemberView, RequestError>> {
        const { spaceId, userId, role } = props
        const member = await this.getMember({ spaceId, userId })
        if (member === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Member not found"
            })
        }
        if (member.role === role) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Current and new roles are the same"
            })
        }

        const readonlyGroup = `spaces/${spaceId}/readonly`
        const membersGroup = `spaces/${spaceId}/members`
        if (member.role !== "readonly" && role === "readonly") {
            // become readonly
            await this.app.sinkron.addMemberToGroup(userId, readonlyGroup)
            await this.app.sinkron.removeMemberFromGroup(userId, membersGroup)
        } else if (member.role === "readonly" && role !== "readonly") {
            // become not readony
            await this.app.sinkron.removeMemberFromGroup(userId, readonlyGroup)
            await this.app.sinkron.addMemberToGroup(userId, membersGroup)
        }
        await this.app.models.members.update({ spaceId, userId }, { role })

        this.app.channels.send(`users/${userId}`, "profile")

        return Result.ok({ ...member, role })
    }

    async removeMember(props: {
        spaceId: string
        userId: string
    }): Promise<ResultType<true, RequestError>> {
        const { spaceId, userId } = props

        const res = await this.app.models.members.delete({
            spaceId,
            userId
        })
        if (res.affected === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: "Member not found"
            })
        }

        const readonlyGroup = `spaces/${spaceId}/readonly`
        const membersGroup = `spaces/${spaceId}/members`
        await this.app.sinkron.removeMemberFromGroup(userId, membersGroup)
        await this.app.sinkron.removeMemberFromGroup(userId, readonlyGroup)

        this.app.channels.send(`users/${userId}`, "profile")

        return Result.ok(true)
    }

    async getUserSpace(
        models: AppModels,
        userId: string,
        spaceId: string
    ): Promise<ResultType<SpaceView, RequestError>> {
        const res = await models.members.findOne({
            where: { userId, spaceId },
            relations: ["space"],
            select: {
                id: true,
                spaceId: true,
                role: true,
                space: {
                    id: true,
                    ownerId: true,
                    name: true,
                    usedStorage: true
                }
            }
        })
        if (res === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                mesasge: "Space not found",
                details: { spaceId, userId }
            })
        }
        const membersCount = await models.members.countBy({ spaceId })
        const space = {
            id: res.spaceId,
            name: res.space.name,
            usedStorage: res.space.usedStorage,
            role: res.role,
            membersCount,
            owner: { id: res.space.ownerId }
        }
        return Result.ok(space)
    }

    async getUserSpaces(
        models: AppModels,
        userId: string
    ): Promise<ResultType<SpaceView[], RequestError>> {
        const res = await models.members.find({
            where: { userId },
            relations: ["space"],
            select: {
                spaceId: true,
                role: true,
                space: {
                    id: true,
                    ownerId: true,
                    name: true,
                    usedStorage: true
                }
            }
        })
        const spaces: SpaceView[] = res.map((m) => ({
            id: m.spaceId,
            name: m.space.name,
            usedStorage: m.space.usedStorage,
            role: m.role,
            membersCount: 0,
            owner: { id: m.space.ownerId }
        }))
        const membersCount = await models.members
            .createQueryBuilder()
            .select("COUNT(1)", "count")
            .addSelect(`"spaceId"`, "id")
            .where({ spaceId: In(spaces.map((s) => s.id)) })
            .groupBy(`"spaceId"`)
            .getRawMany()
        membersCount.forEach((item) => {
            spaces.find((s) => s.id === item.id)!.membersCount = item.count
        })
        return Result.ok(spaces)
    }

    async lockDocument({
        spaceId,
        docId,
        lock
    }: LockDocumentProps): Promise<ResultType<true, RequestError>> {
        const res = await this.app.sinkron.updateDocumentPermissions(
            docId,
            (p) => {
                const group = Role.group(`spaces/${spaceId}/members`)
                if (lock) {
                    p.remove(Action.update, group)
                    p.remove(Action.delete, group)
                } else {
                    p.add(Action.update, group)
                    p.add(Action.delete, group)
                }
            }
        )
        if (!res.isOk) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Couldn't set permissions"
            })
        }

        const updateRes =
            await this.app.sinkronServer.updateDocumentWithCallback(
                docId,
                (doc) => {
                    // @ts-expect-error doc untyped
                    doc.isLocked = lock
                }
            )
        if (!updateRes.isOk) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                message: "Couldn't update document"
            })
        }

        return Result.ok(true)
    }
}

export { SpaceService }
