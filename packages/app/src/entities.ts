import { EntitySchema, ColumnType } from "typeorm"

export type User = {
    id: string // uuid
    createdAt: Date
    email: string
    isDisabled: boolean
    hasUnreadNotifications: boolean
}

export type Otp = {
    id: string // uuid
    code: string
    createdAt: Date
    email: string
    attempts: number
}

export type AuthToken = {
    token: string
    userId: string // uuid
    user: User
    createdAt: Date
    expiresAt: Date | null
    lastAccess: Date
    client: string
}

export type Space = {
    id: string // uuid
    name: string
    owner: User
    ownerId: string // uuid
    createdAt: Date
    usedStorage: number
}

export type SpaceRole = "readonly" | "editor" | "admin" | "owner"

export type SpaceMember = {
    id: string // uuid
    user: User
    userId: string // uuid
    space: Space
    spaceId: string // uuid
    role: SpaceRole
    createdAt: Date
}

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

export type File = {
    id: string // uuid
    spaceId: string // uuid
    space: Space
    size: number
    createdAt: Date
}

export type Post = {
    docId: string // uuid
    spaceId: string // uuid
    space: Space
    content: string
    publishedAt: string
}

const sqliteTypes = {
    uuid: String,
    date: Date
}

const postgresTypes: { [key: string]: ColumnType } = {
    uuid: "uuid",
    date: "timestamp with time zone"
}

const createEntities = (type: "postgres" | "sqlite") => {
    const types = type == "postgres" ? postgresTypes : sqliteTypes

    const UserEntity = new EntitySchema<User>({
        name: "user",
        columns: {
            id: { type: types.uuid, primary: true, generated: "uuid" },
            createdAt: { type: types.date, createDate: true },
            email: { type: String },
            isDisabled: { type: Boolean },
            hasUnreadNotifications: { type: Boolean }
        },
        indices: [{ columns: ["email"] }]
    })

    const OtpEntity = new EntitySchema<Otp>({
        name: "otp",
        columns: {
            id: { type: types.uuid, primary: true, generated: "uuid" },
            code: { type: String },
            createdAt: { type: types.date, createDate: true },
            email: { type: String },
            attempts: { type: Number }
        },
        indices: [{ columns: ["email"] }]
    })

    const AuthTokenEntity = new EntitySchema<AuthToken>({
        name: "token",
        columns: {
            token: { type: types.uuid, primary: true, generated: "uuid" },
            userId: { type: types.uuid },
            createdAt: { type: types.date, createDate: true },
            expiresAt: { type: types.date, nullable: true },
            lastAccess: { type: types.date, createDate: true },
            client: { type: String, nullable: true }
        },
        relations: {
            user: { type: "many-to-one", target: "user" }
        },
        indices: [{ columns: ["userId"] }]
    })

    const SpaceEntity = new EntitySchema<Space>({
        name: "space",
        columns: {
            id: { type: types.uuid, primary: true, generated: "uuid" },
            name: { type: String },
            ownerId: { type: types.uuid },
            createdAt: { type: types.date, createDate: true },
            usedStorage: { type: Number, default: 0 }
        },
        relations: {
            owner: { type: "many-to-one", target: "user" }
        }
    })

    const SpaceMemberEntity = new EntitySchema<SpaceMember>({
        name: "space_member",
        columns: {
            id: { type: types.uuid, primary: true, generated: "uuid" },
            userId: { type: types.uuid },
            spaceId: { type: types.uuid },
            role: { type: String },
            createdAt: { type: types.date, createDate: true }
        },
        relations: {
            space: { type: "many-to-one", target: "space" },
            user: { type: "many-to-one", target: "user" }
        },
        indices: [{ columns: ["userId"] }, { columns: ["spaceId"] }]
    })

    const InviteEntity = new EntitySchema<Invite>({
        name: "invite",
        columns: {
            id: { type: types.uuid, primary: true, generated: "uuid" },
            spaceId: { type: types.uuid },
            role: { type: String },
            fromId: { type: types.uuid },
            toId: { type: types.uuid },
            createdAt: { type: types.date, createDate: true },
            updatedAt: { type: types.date, updateDate: true },
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

    const FileEntity = new EntitySchema<File>({
        name: "file",
        columns: {
            id: { type: types.uuid, primary: true, generated: "uuid" },
            spaceId: { type: types.uuid },
            createdAt: { type: types.date, createDate: true },
            size: { type: Number }
        },
        relations: {
            space: { type: "many-to-one", target: "space" }
        }
    })

    const PostEntity = new EntitySchema<Post>({
        name: "post",
        columns: {
            docId: { type: types.uuid, primary: true },
            spaceId: { type: types.uuid },
            content: { type: String },
            publishedAt: { type: types.date, updateDate: true }
        },
        relations: {
            space: { type: "many-to-one", target: "space" }
        }
    })

    return [
        UserEntity,
        OtpEntity,
        AuthTokenEntity,
        SpaceEntity,
        SpaceMemberEntity,
        InviteEntity,
        FileEntity,
        PostEntity
    ]
}

export { createEntities }
