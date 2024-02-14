import { EntitySchema, DataSource, Repository } from 'typeorm'
import { Raw } from 'typeorm'

import { AuthToken, User, Space, SpaceRole, SpaceMember } from '../entities'
import { Controller } from './index'

import { Permissions, Permission } from '../../sinkron/permissions'
import { Sinkron } from '../../sinkron/sinkron'
import { Result, ResultType } from '../../sinkron/result'
import { ErrorCode } from '../../sinkron/protocol'

type RequestError = {
    code: ErrorCode
    details: Object
    message: string
}

type CreateSpaceProps = {
    ownerId: string
    name: string
}

type AddMemberProps = {
    userId: string
    spaceId: string
    role: SpaceRole
}

type UserSpaces = { id: string; name: string; role: SpaceRole }[]

class SpacesController {
    constructor(db: DataSource, c: Controller) {
        this.db = db
        this.controller = c
        this.sinkron = c.sinkron

        this.users = db.getRepository('user')
        this.spaces = db.getRepository('space')
        this.members = db.getRepository('space_member')
    }

    db: DataSource
    controller: Controller
    sinkron: Sinkron

    users: Repository<User>
    spaces: Repository<Space>
    members: Repository<SpaceMember>

    async create(
        props: CreateSpaceProps
    ): Promise<ResultType<Space, RequestError>> {
        const { ownerId, name } = props

        const data = { name, ownerId }
        const res = await this.spaces.insert(data)
        const space = {
            ...data,
            ...res.generatedMaps[0]
        } as Space

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

        await this.members.insert({
            userId: ownerId,
            spaceId: space.id,
            role: 'admin'
        })
        await this.sinkron.addMemberToGroup(ownerId, `spaces/${space.id}/admin`)

        return Result.ok(space)
    }

    async delete(id: string): Promise<ResultType<true, RequestError>> {
        const res = await this.spaces.delete(id)
        if (res.affected === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: 'Space not found',
                details: { id }
            })
        }

        const col = `spaces/${id}`
        await this.sinkron.deleteCollection(col)

        return Result.ok(true)
    }

    async addMember(props: AddMemberProps) {
        const { userId, spaceId, role } = props

        const cnt1 = await this.spaces.countBy({ id: spaceId })
        if (cnt1 === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: 'Space not found',
                details: { id: spaceId }
            })
        }

        const cnt2 = await this.users.countBy({ id: userId })
        if (cnt2 === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: 'User not found',
                details: { id: userId }
            })
        }

        // TODO check if already added

        await this.members.insert({ userId, spaceId, role })
        await this.sinkron.addMemberToGroup(userId, `spaces/${spaceId}/${role}`)
    }

    async getUserSpaces(
        userId: string
    ): Promise<ResultType<UserSpaces, RequestError>> {
        const cnt = await this.users.countBy({ id: userId })
        if (cnt === 0) {
            return Result.err({
                code: ErrorCode.NotFound,
                message: 'User not found',
                details: { id: userId }
            })
        }

        const res = await this.members.find({
            where: { userId },
            relations: ['space']
        })
        const spaces = res.map((m) => ({
            id: m.spaceId,
            name: m.space.name,
            role: m.role
        }))
        return Result.ok(spaces)
    }

    // update space member

    // remove member from space

    /*
    async sendInvite(userId: string, role: SpaceRole) {
        this.invites.insert({
            to: userId,
            role: SpaceRole
        })
    }

    async acceptInvite(inviteId: string) {
        // this.addMemberToSpace(...)
    }

    async declineInvite(inviteId: string) {}

    async cancelInvite(inviteId: string) {}
    */
}

export { SpacesController }
