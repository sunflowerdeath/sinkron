import { uniq } from "lodash"

const Role = {
    any: () => "any",
    user: (id: string) => `user:${id}`,
    group: (id: string) => `group:${id}`
}

export enum Action {
    read = "read",
    create = "create",
    update = "update",
    delete = "delete"
}

export type PermissionsTable = {
    -readonly [key in keyof typeof Action]: string[]
}

export type User = {
    id: string,
    groups: string[]
}

const emptyPermissionsTable = {
    read: [],
    create: [],
    update: [],
    delete: []
}

class Permissions {
    table: PermissionsTable

    constructor(table?: PermissionsTable) {
        this.table = table || emptyPermissionsTable
    }

    // Adds permission to the table
    add(action: Action, role: string) {
        this.table[action] = uniq([role, ...this.table[action]])
    }

    // Removes permission from the table
    remove(action: Action, role: string) {
        this.table[action] = this.table[action].filter(
            (r) => r !== role
        )
    }

    // Checks if user has permission (issued directly on him or on his
    // group or group role)
    check(user: User, action: Action) {
        const roles = this.table[action]
        for (let i in roles) {
            const role = roles[i]
            if (role === "any") return true
            let match = role.match(/^user:(.+)$/)
            if (match && user.id === match[1]) return true
            match = role.match(/^group:(.+)$/)
            if (match && user.groups.includes(match[1])) return true
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
}

export { emptyPermissionsTable, Permissions, Role }
