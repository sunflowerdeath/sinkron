import { DataSource, Repository } from "typeorm"
import { In } from "typeorm"
import { v4 as uuidv4 } from "uuid"
import * as Automerge from "@automerge/automerge"

import { Sinkron, Permissions } from "sinkron"
// import type { Permission } from "sinkron"
// import type { ErrorCode } from "sinkron"

import { Result, ResultType } from "../utils/result"

import { User, Space, SpaceRole, SpaceMember, Invite } from "../entities"
import { Controller, ErrorCode } from "./index"
import type { RequestError } from "./index"

type CreateSpaceProps = {
    ownerId: string
    name: string
}

type AddMemberProps = {
    userId: string
    spaceId: string
    role: SpaceRole
}

// type RemoveMemberProps = {
// spaceId: string
// memberId: string
// }

type UserSpace = {
    id: string
    name: string
    role: SpaceRole
    membersCount: number
    owner: { id: string }
}

class SpacesController {
    constructor(db: DataSource, c: Controller) {
        this.db = db
        this.controller = c
        this.sinkron = c.sinkron

        this.invites = db.getRepository("invite")
        this.users = db.getRepository("user")
        this.spaces = db.getRepository("space")
        this.members = db.getRepository("space_member")
    }

    db: DataSource
    controller: Controller
    sinkron: Sinkron

    invites: Repository<Invite>
    users: Repository<User>
    spaces: Repository<Space>
    members: Repository<SpaceMember>

    async exists(id: string): Promise<boolean> {
        const count = await this.spaces.countBy({ id })
        return count === 1
    }

    async create(
        props: CreateSpaceProps
    ): Promise<ResultType<UserSpace, RequestError>> {
        const { name, ownerId } = props
        const createRes = await this.spaces.insert({ name, ownerId })

        const space: UserSpace = {
            ...createRes.generatedMaps[0],
            name,
            owner: { id: ownerId } as User,
            role: "owner",
            membersCount: 1
        }

        const col = `spaces/${space.id}`

        await this.sinkron.createGroup(`${col}/readonly`)
        await this.sinkron.createGroup(`${col}/editor`)
        await this.sinkron.createGroup(`${col}/admin`)

        /*
        const p = new Permissions()
        p.add('group:${col}/readonly', [Permission.read])
        p.add('group:${col}/editor', [Permission.read, Permission.write])
        p.add('group:${col}/admin', [
            Permission.read,
            Permission.write,
            Permission.admin
        ])
        */

        await this.sinkron.createCollection(col)

        const meta = Automerge.from({ meta: true, categories: {} })
        await this.sinkron.createDocument(uuidv4(), col, Automerge.save(meta))

        this.addMember({ userId: ownerId, spaceId: space.id, role: "owner" })

        return Result.ok(space)
    }

    async delete(spaceId: string) {
        await this.members.delete({ spaceId })
        await this.invites.delete({ spaceId })
        await this.sinkron.deleteCollection(`spaces/${spaceId}`)
        // TODO delete sinkron groups
        await this.spaces.delete({ id: spaceId })
    }

    async getMembers(
        spaceId: string
    ): Promise<User[]> {
        const res = await this.members.find({
            where: { spaceId },
            relations: { user: true },
            select: { user: { id: true, name: true }, role: true }
        })
        const members = res.map((m) => ({ role: m.role, ...m.user }))
        return members
    }

    async addMember(props: AddMemberProps) {
        const { userId, spaceId, role } = props
        await this.members.insert({ userId, spaceId, role })
        await this.sinkron.addMemberToGroup(userId, `spaces/${spaceId}/${role}`)
    }

    async getUserSpaces(
        userId: string
    ): Promise<ResultType<UserSpace[], RequestError>> {
        const res = await this.members.find({
            where: { userId },
            relations: ["space"],
            select: {
                spaceId: true,
                role: true,
                space: { id: true, ownerId: true, name: true }
            }
        })
        const spaces: UserSpace[] = res.map((m) => ({
            id: m.spaceId,
            name: m.space.name,
            role: m.role,
            membersCount: 0,
            owner: { id: m.space.ownerId }
        }))
        const membersCount = await this.members
            .createQueryBuilder()
            .select("COUNT(1)", "count")
            .addSelect("spaceId", "id")
            .where({ spaceId: In(spaces.map((s) => s.id)) })
            .groupBy("id")
            .getRawMany()
        membersCount.forEach((item) => {
            spaces.find((s) => s.id === item.id)!.membersCount = item.count
        })
        return Result.ok(spaces)
    }
}

export { SpacesController }
