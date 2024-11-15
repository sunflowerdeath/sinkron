import { uniq } from "lodash"

export type Role =
    | { kind: "any" }
    | { kind: "user"; id: string }
    | { kind: "group"; id: string }

const role = {
    any: (): Role => ({ kind: "any" }),
    user: (id: string): Role => ({ kind: "user", id }),
    group: (id: string): Role => ({ kind: "group", id })
}

export enum Action {
    read = "read",
    create = "create",
    update = "update",
    delete = "delete"
}

export type PermissionsTable = {
    -readonly [key in keyof typeof Action]: Role[]
}

export type User = {
    id: string
    groups: string[]
}

const emptyPermissionsTable = () => ({
    read: [],
    create: [],
    update: [],
    delete: []
})

const anyPermissionsTable = (): PermissionsTable => ({
    read: [role.any()],
    create: [role.any()],
    update: [role.any()],
    delete: [role.any()]
})

class Permissions {
    table: PermissionsTable

    constructor(table: PermissionsTable) {
        this.table = table
    }

    // Adds permission to the table
    add(action: Action, role: Role) {
        // TODO fix compare
        this.table[action] = uniq([role, ...this.table[action]])
    }

    // Removes permission from the table
    remove(action: Action, role: Role) {
        // TODO fix compare
        this.table[action] = this.table[action].filter((r) => r !== role)
    }

    // Checks if user has permission (issued directly on him or on his group)
    check(user: User, action: Action) {
        const roles = this.table[action]
        for (const i in roles) {
            const role = roles[i]
            if (role.kind === "any") {
                return true
            } else if (role.kind === "user") {
                if (user.id === role.id) return true
            } else if (role.kind === "group") {
                if (user.groups.includes(role.id)) return true
            }
        }
        return false
    }

    stringify() {
        return JSON.stringify(this.table)
    }

    static parse(str: string) {
        const table = JSON.parse(str)
        return new Permissions(table)
    }

    static any() {
        return new Permissions(anyPermissionsTable())
    }

    static empty() {
        return new Permissions(emptyPermissionsTable())
    }
}

export { Permissions, role }
