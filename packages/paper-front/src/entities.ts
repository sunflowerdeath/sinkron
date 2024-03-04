import { AutomergeNode } from "./slate"

export interface Space {
    id: string
    name: string
    owner: User
    membersCount: number
    role: SpaceRole
}

export type SpaceRole = "readonly" | "editor" | "admin"

export interface User {
    id: string
    name: string
    spaces: Space[]
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

export interface Document {
    content: AutomergeNode
    categories: string[]
}
