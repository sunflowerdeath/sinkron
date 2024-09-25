import { EntitySchema } from "typeorm"

const uuidType = String

export type User = {
    id: string
    createdAt: Date
    email: string
    isDisabled: boolean
    hasUnreadNotifications: boolean
}

const UserEntity = new EntitySchema<User>({
    name: "user",
    columns: {
        id: { type: uuidType, primary: true, generated: "uuid" },
        createdAt: { type: Date, createDate: true },
        email: { type: String },
        name: { type: String },
        registrationIsCompleted: { type: Boolean },
        isDisabled: { type: Boolean },
        hasUnreadNotifications: { type: Boolean }
    },
    indices: [{ columns: ["email"] }]
})

export type Otp = {
    id: string
    code: string
    createdAt: Date
    email: string
    attempts: number
}

const OtpEntity = new EntitySchema<Otp>({
    name: "otp",
    columns: {
        id: { type: uuidType, primary: true, generated: "uuid" },
        code: { type: String },
        createdAt: { type: Date, createDate: true },
        email: { type: String },
        attempts: { type: Number }
    },
    indices: [{ columns: ["email"] }]
})

export type AuthToken = {
    token: string
    userId: string
    user: User
    createdAt: Date
    expiresAt: Date | null
    lastAccess: Date
    client: string
}

const AuthTokenEntity = new EntitySchema<AuthToken>({
    name: "token",
    columns: {
        token: { type: uuidType, primary: true, generated: "uuid" },
        userId: { type: uuidType },
        createdAt: { type: Date, createDate: true },
        expiresAt: { type: Date, nullable: true },
        lastAccess: { type: Date, createDate: true },
        client: { type: String, nullable: true }
    },
    relations: {
        user: { type: "many-to-one", target: "user" }
    },
    indices: [{ columns: ["userId"] }]
})

export type Space = {
    id: string // uuid
    name: string
    owner: User
    ownerId: string // uuid
    createdAt: Date
}

const SpaceEntity = new EntitySchema<Space>({
    name: "space",
    columns: {
        id: { type: uuidType, primary: true, generated: "uuid" },
        name: { type: String },
        ownerId: { type: uuidType },
        createdAt: { type: Date, createDate: true }
    },
    relations: {
        owner: { type: "many-to-one", target: "user" }
    }
})

export type SpaceRole = "readonly" | "editor" | "admin" | "owner"

export type SpaceMember = {
    id: string // uuid
    space: Space
    user: User
    spaceId: string // uuid
    userId: string // uuid
    role: SpaceRole
    createdAt: Date
}

const SpaceMemberEntity = new EntitySchema<SpaceMember>({
    name: "space_member",
    columns: {
        id: { type: uuidType, primary: true, generated: "uuid" },
        userId: { type: uuidType },
        spaceId: { type: uuidType },
        role: { type: String },
        createdAt: { type: Date, createDate: true }
    },
    relations: {
        space: { type: "many-to-one", target: "space" },
        user: { type: "many-to-one", target: "user" }
    },
    indices: [{ columns: ["userId"] }, { columns: ["spaceId"] }]
})

export type InviteStatus = "sent" | "accepted" | "declined" | "cancelled"

export type Invite = {
    id: string // uuid
    space: Space
    spaceId: string // uuid
    role: "readonly" | "editor" | "admin"
    from: User
    fromId: string // uuid
    to: User
    toId: string // uuid
    createdAt: Date
    updatedAt: Date
    status: InviteStatus
    isHidden: boolean
}

const InviteEntity = new EntitySchema<Invite>({
    name: "invite",
    columns: {
        id: { type: uuidType, primary: true, generated: "uuid" },
        spaceId: { type: uuidType },
        role: { type: String },
        fromId: { type: uuidType },
        toId: { type: uuidType },
        createdAt: { type: Date, createDate: true },
        updatedAt: { type: Date, updateDate: true },
        status: { type: String },
        isHidden: { type: Boolean }
    },
    relations: {
        space: { type: "many-to-one", target: "space" },
        from: { type: "many-to-one", target: "user" },
        to: { type: "many-to-one", target: "user" }
    },
    indices: [{ columns: ["fromId"] }, { columns: ["toId"] }]
})

export type File = {
    id: string
    spaceId: string
    space: Space
    size: number
    createdAt: Date
}

const FileEntity = new EntitySchema<File>({
    name: "file",
    columns: {
        id: { type: uuidType, primary: true, generated: "uuid" },
        spaceId: { type: uuidType },
        createdAt: { type: Date, createDate: true },
        size: { type: Number }
    },
    relations: {
        space: { type: "many-to-one", target: "space" }
    }
})

const entities = [
    UserEntity,
    OtpEntity,
    AuthTokenEntity,
    SpaceEntity,
    SpaceMemberEntity,
    InviteEntity,
    FileEntity
]

export { entities }
