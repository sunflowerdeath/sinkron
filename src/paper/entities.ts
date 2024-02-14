import { EntitySchema } from 'typeorm'

export type User = {
    id: string
    createdAt: Date
    isDisabled: boolean
    name: string
    password: string
}

export type AuthToken = {
    token: string
    userId: string
    user: User
    createdAt: Date
    expiresAt: Date | null
    lastAccess: Date
    client: string
}

export type Space = {
    id: string
    name: string
    owner: User
    ownerId: string
    createdAt: Date
}

export type SpaceRole = 'readonly' | 'editor' | 'admin'

export type SpaceMember = {
    id: string
    space: Space
    user: User
    spaceId: string
    userId: string
    role: SpaceRole
    createdAt: Date
}

const UserEntity = new EntitySchema<User>({
    name: 'user',
    columns: {
        id: { type: String, primary: true, generated: 'uuid' },
        createdAt: { type: Date, createDate: true },
        isDisabled: { type: Boolean },
        name: { type: String, unique: true },
        password: { type: String }
    }
})

const AuthTokenEntity = new EntitySchema<AuthToken>({
    name: 'token',
    columns: {
        token: { type: String, primary: true, generated: 'uuid' },
        userId: { type: String },
        createdAt: { type: Date, createDate: true },
        expiresAt: { type: Date, nullable: true },
        lastAccess: { type: Date, createDate: true },
        client: { type: String, nullable: true }
    },
    relations: {
        user: { type: 'many-to-one', target: 'user' }
    }
})

const SpaceEntity = new EntitySchema<Space>({
    name: 'space',
    columns: {
        id: { type: String, primary: true, generated: 'uuid' },
        name: { type: String },
        createdAt: { type: Date, createDate: true }
    }
})

const SpaceMemberEntity = new EntitySchema<SpaceMember>({
    name: 'space_member',
    columns: {
        id: { type: String, primary: true, generated: 'uuid' },
        userId: { type: String },
        spaceId: { type: String },
        role: { type: String },
        createdAt: { type: Date, createDate: true }
    },
    relations: {
        space: { type: 'many-to-one', target: 'space' },
        user: { type: 'many-to-one', target: 'user' }
    }
})

const entities = [UserEntity, AuthTokenEntity, SpaceEntity, SpaceMemberEntity]

export { entities }
