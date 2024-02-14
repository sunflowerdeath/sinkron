import { uniq } from 'lodash'

const Role = {
    any: () => 'any',
    user: (id: string) => `user:${id}`,
    group: (id: string) => `group:${id}`
}

export enum Permission {
    read = 'read',
    write = 'write',
    admin = 'admin'
}

type PermissionsTable = {
    -readonly [key in keyof typeof Permission]: string[]
}

const emptyPermissionsTable = {
    read: [],
    write: [],
    admin: []
}

class Permissions {
    table: PermissionsTable

    constructor(table?: PermissionsTable) {
        this.table = table || emptyPermissionsTable
    }

    // Adds permission to the table
    add(permission: Permission, role: string) {
        this.table[permission] = uniq([role, ...this.table[permission]])
    }

    // Removes permission from the table
    remove(permission: Permission, role: string) {
        this.table[permission] = this.table[permission].filter(
            (r) => r !== role
        )
    }

    // Checks if user has permission (issued directly on him or on his
    // group or group role)
    check(user: any, permission: Permission) {
        const roles = this.table[permission]
        for (let i in roles) {
            const role = roles[i]
            if (role === 'any') return true
            let match = role.match(/^user:(.+)$/)
            if (match && user.id === match[0]) return true
            match = role.match(/^group:(.+)$/)
            if (match && user.groups.includes(match[0])) return true
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

export { emptyPermissionsTable, Permissions }
