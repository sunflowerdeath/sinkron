export declare enum Action {
    read = "read",
    create = "create",
    update = "update",
    delete = "delete"
}
export type PermissionsTable = {
    -readonly [key in keyof typeof Action]: string[];
};
export type User = {
    id: string;
    groups: string[];
};
declare const emptyPermissionsTable: {
    read: never[];
    create: never[];
    update: never[];
    delete: never[];
};
declare class Permissions {
    table: PermissionsTable;
    constructor(table?: PermissionsTable);
    add(action: Action, role: string): void;
    remove(action: Action, role: string): void;
    check(user: User, action: Action): boolean;
    stringify(): string;
    static parse(str: string): Permissions;
}
export { emptyPermissionsTable, Permissions };
