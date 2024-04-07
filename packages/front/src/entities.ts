import { AutomergeNode } from "./slate"

export interface Space {
    id: string
    name: string
    owner: User
    membersCount: number
    role: SpaceRole
}

export type SpaceRole = "readonly" | "editor" | "admin" | "owner"

export type InviteStatus = "sent" | "cancelled" | "accepted" | "declined" | "rejected"

export type Invite = {
    id: string
    createAt: string
    updatedAt: string
    status: InviteStatus
    to: { id: string; name: string }
    from: { id: string; name: string }
    space: { id: string; name: string }
    role: SpaceRole
}

export type SpaceMember = {
    role: string
    name: string
    id: string
}

export type Credentials = {
    name: string
    password: string
}

export type User = {
    token: string
    id: string
    name: string
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
}
