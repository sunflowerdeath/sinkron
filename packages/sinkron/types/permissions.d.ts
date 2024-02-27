export declare enum Permission {
    read = "read",
    write = "write",
    admin = "admin"
}
export type PermissionsTable = {
    -readonly [key in keyof typeof Permission]: string[];
};
declare const emptyPermissionsTable: {
    read: never[];
    write: never[];
    admin: never[];
};
declare class Permissions {
    table: PermissionsTable;
    constructor(table?: PermissionsTable);
    add(permission: Permission, role: string): void;
    remove(permission: Permission, role: string): void;
    check(user: any, permission: Permission): boolean;
    stringify(): string;
    static parse(str: string): Permissions;
}
export { emptyPermissionsTable, Permissions };
