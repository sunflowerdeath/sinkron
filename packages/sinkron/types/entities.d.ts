import { EntitySchema } from "typeorm";
export type Document = {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    rev: number;
    data: Uint8Array | null;
    owner: string;
    permissions: string;
    isDeleted: boolean;
    colId: string;
    col: Collection;
    colrev: number;
};
export type Collection = {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    colrev: number;
    owner: string;
    permissions: string;
};
export type Group = {
    id: string;
    name: string;
};
export type GroupMember = {
    id: string;
    user: string;
    groupId: string;
    group: Group;
};
declare const entities: (EntitySchema<Collection> | EntitySchema<Group> | EntitySchema<GroupMember>)[];
export { entities };
