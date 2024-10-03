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

        const createRes = await models.spaces.insert({ name, ownerId })

        const { id } = createRes.generatedMaps[0]
        const space: SpaceView = {
            id,
            name,
            owner: { id: ownerId } as User,
            role: "owner",
            membersCount: 1
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

        this.addMember(models, {
            userId: ownerId,
            spaceId: space.id,
            role: "owner"
        })

        return Result.ok(space)
    }

    async delete(models: AppModels, spaceId: string) {
        await models.members.delete({ spaceId })
        await models.invites.delete({ spaceId })
        const col = `spaces/${spaceId}`
        await this.app.sinkron.deleteCollection(col)
        await this.app.sinkron.deleteGroup(`${col}/readonly`)
        await this.app.sinkron.deleteGroup(`${col}/members`)
        await models.spaces.delete({ id: spaceId })
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

    async getMembers(models: AppModels, spaceId: string): Promise<User[]> {
        const res = await models.members.find({
            where: { spaceId },
            relations: { user: true },
            select: { user: { id: true, email: true }, role: true }
        })
        const members = res.map((m) => ({ role: m.role, ...m.user }))
        return members
    }

    async addMember(models: AppModels, props: AddMemberProps) {
        const { userId, spaceId, role } = props
        await models.members.insert({ userId, spaceId, role })
        const group =
            `spaces/${spaceId}/` +
            (role === "readonly" ? "readonly" : "members")
        await this.app.sinkron.addMemberToGroup(userId, group)
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
}

export { SpaceService }
