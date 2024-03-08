import { EntitySchema } from "typeorm"

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

export type SpaceRole = "readonly" | "editor" | "admin" | "owner"

export type SpaceMember = {
    id: string
    space: Space
    user: User
    spaceId: string
    userId: string
    role: SpaceRole
    createdAt: Date
}

export type InviteStatus = "sent" | "accepted" | "declined" | "cancelled"

export type Invite = {
    id: string
    space: Space
    spaceId: string
    role: SpaceRole
    from: User
    fromId: string
    to: User
    toId: string
    createdAt: Date
    updatedAt: Date
    status: InviteStatus
    notificationHidden: boolean
}

const UserEntity = new EntitySchema<User>({
    name: "user",
    columns: {
        id: { type: String, primary: true, generated: "uuid" },
        createdAt: { type: Date, createDate: true },
        isDisabled: { type: Boolean },
        name: { type: String, unique: true },
        password: { type: String }
    }
})

const AuthTokenEntity = new EntitySchema<AuthToken>({
    name: "token",
    columns: {
        token: { type: String, primary: true, generated: "uuid" },
        userId: { type: String }, // index?
        createdAt: { type: Date, createDate: true },
        expiresAt: { type: Date, nullable: true },
        lastAccess: { type: Date, createDate: true },
        client: { type: String, nullable: true }
    },
    relations: {
        user: { type: "many-to-one", target: "user" }
    },
    indices: [
        { columns: ["userId"] },
    ]
})

const SpaceEntity = new EntitySchema<Space>({
    name: "space",
    columns: {
        id: { type: String, primary: true, generated: "uuid" },
        name: { type: String },
        ownerId: { type: String },
        createdAt: { type: Date, createDate: true }
    },
    relations: {
        owner: { type: "many-to-one", target: "user" }
    }
})

const SpaceMemberEntity = new EntitySchema<SpaceMember>({
    name: "space_member",
    columns: {
        id: { type: String, primary: true, generated: "uuid" },
        userId: { type: String },
        spaceId: { type: String },
        role: { type: String },
        createdAt: { type: Date, createDate: true }
    },
    relations: {
        space: { type: "many-to-one", target: "space" },
        user: { type: "many-to-one", target: "user" }
    },
    indices: [
        { columns: ["userId"] },
        { columns: ["spaceId"] },
    ]
})

const InviteEntity = new EntitySchema<Invite>({
    name: "invite",
    columns: {
        id: { type: String, primary: true, generated: "uuid" },
        spaceId: { type: String },
        role: { type: String },
        fromId: { type: String },
        toId: { type: String },
        createdAt: { type: Date, createDate: true },
        updatedAt: { type: Date, updateDate: true },
        status: { type: String },
        notificationHidden: { type: Boolean }
    },
    relations: {
        space: { type: "many-to-one", target: "space" },
        from: { type: "many-to-one", target: "user" },
        to: { type: "many-to-one", target: "user" }
    },
    indices: [
        { columns: ["fromId"] },
        { columns: ["toId"] },
    ]
})

const entities = [
    UserEntity,
    AuthTokenEntity,
    SpaceEntity,
    SpaceMemberEntity,
    InviteEntity
]

export { entities }
