import { AutomergeNode } from "./slate"

export interface Space {
    id: string
    name: string
    owner: User
    membersCount: number
    role: SpaceRole
    usedStorage: number
}

export type SpaceRole = "readonly" | "editor" | "admin" | "owner"

export const spaceRoleMap: { [key in SpaceRole]: string } = {
    editor: "Editor",
    readonly: "Read-only",
    admin: "Admin",
    owner: "Owner"
}

export type InviteStatus =
    | "sent"
    | "cancelled"
    | "accepted"
    | "declined"
    | "rejected"

export type Invite = {
    id: string
    createAt: string
    updatedAt: string
    status: InviteStatus
    to: { id: string; email: string }
    from: { id: string; email: string }
    space: { id: string; name: string }
    role: SpaceRole
}

export type SpaceMember = {
    id: string
    email: string
    role: SpaceRole 
}

export type Credentials = {
    name: string
    password: string
}

export type User = {
    id: string
    email: string
    spaces: Space[]
    hasUnreadNotifications: boolean
}

export type Category = {
    id: string
    name: string
    parent: string | null
}

export type Metadata = {
    meta: true
    categories: { [key: string]: Category }
}

export type Document = {
    content: AutomergeNode
    categories: string[]
    isPublished: boolean
    isLocked: boolean
}

export type Post = {
    id: string
    spaceId: string
    publishedAt: string
}
