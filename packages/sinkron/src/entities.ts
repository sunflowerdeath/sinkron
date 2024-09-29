import { EntitySchema } from "typeorm"

export type Document = {
    id: string
    createdAt: Date
    updatedAt: Date
    rev: number
    data: Uint8Array | null
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
    colrev: string
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

const getEntities = (db: "postgres" | "sqlite") => {
    const uuidType = db === "postgres" ? "uuid" : "text"
    const blobType = db === "postgres" ? "bytea" : "blob"

    const DocumentEntity = new EntitySchema<Document>({
        name: "document",
        columns: {
            id: { type: uuidType, primary: true },
            rev: { type: Number },
            data: { type: blobType, nullable: true },
            createdAt: { type: Date, createDate: true },
            updatedAt: { type: Date, updateDate: true },
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
            id: { type: uuidType, primary: true },
            isRemoved: { type: Boolean },
            colrev: { type: Number },
            colId: { type: String },
            docId: { type: uuidType }
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
            createdAt: { type: Date, createDate: true },
            updatedAt: { type: Date, updateDate: true },
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
            id: { type: uuidType, primary: true, generated: "uuid" },
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
