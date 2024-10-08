import { EntitySchema, ColumnType } from "typeorm"

export type Document = {
    id: string
    createdAt: Date
    updatedAt: Date
    rev: number
    data: Buffer | null
    permissions: string
    isDeleted: boolean
    colId: string
    col: Collection
    colrev: number
}

export type Ref = {
    id: string
    colId: string
    col: Collection
    colrev: number
    docId: string
    doc: Document
    isRemoved: boolean
}

export type Collection = {
    id: string
    createdAt: Date
    updatedAt: Date
    colrev: number
    permissions: string
    ref: boolean
}

export type Group = {
    id: string
    name: string
}

export type GroupMember = {
    id: string
    user: string
    groupId: string
    group: Group
}

const sqliteTypes: { [key: string]: ColumnType } = {
    uuid: String,
    date: Date,
    blob: "blob"
}

const postgresTypes: { [key: string]: ColumnType } = {
    uuid: "uuid",
    date: "timestamp with time zone",
    blob: "bytea"
}

const getEntities = (db: "postgres" | "sqlite") => {
    const types = db === "postgres" ? postgresTypes : sqliteTypes

    const DocumentEntity = new EntitySchema<Document>({
        name: "document",
        columns: {
            id: { type: types.uuid, primary: true },
            rev: { type: Number },
            data: { type: types.blob, nullable: true },
            createdAt: { type: types.date, createDate: true },
            updatedAt: { type: types.date, updateDate: true },
            isDeleted: { type: Boolean },
            permissions: { type: String },
            colrev: { type: Number },
            colId: { type: String }
        },
        relations: {
            col: { type: "many-to-one", target: "collection" }
        },
        indices: [{ columns: ["colId", "colrev"] }]
    })

    const RefEntity = new EntitySchema<Ref>({
        name: "ref",
        columns: {
            id: { type: types.uuid, primary: true },
            isRemoved: { type: Boolean },
            colrev: { type: Number },
            colId: { type: String },
            docId: { type: types.uuid }
        },
        relations: {
            col: { type: "many-to-one", target: "collection" },
            doc: { type: "many-to-one", target: "document" }
        },
        indices: [{ columns: ["docId"] }, { columns: ["colId", "colrev"] }]
    })

    const CollectionEntity = new EntitySchema<Collection>({
        name: "collection",
        columns: {
            id: { type: String, primary: true },
            createdAt: { type: types.date, createDate: true },
            updatedAt: { type: types.date, updateDate: true },
            colrev: { type: Number },
            permissions: { type: String },
            ref: { type: Boolean, default: false }
        }
    })

    const GroupEntity = new EntitySchema<Group>({
        name: "group",
        columns: {
            id: { type: String, primary: true }
        }
    })

    const GroupMemberEntity = new EntitySchema<GroupMember>({
        name: "group_member",
        columns: {
            id: { type: types.uuid, primary: true, generated: "uuid" },
            user: { type: String },
            groupId: { type: String }
        },
        relations: {
            group: { type: "many-to-one", target: "group" }
        },
        indices: [{ columns: ["user"] }]
    })

    return [
        DocumentEntity,
        CollectionEntity,
        RefEntity,
        GroupEntity,
        GroupMemberEntity
    ]
}

export { getEntities }
