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

const DocumentEntity = new EntitySchema<Document>({
    name: "document",
    columns: {
        id: { type: String, primary: true },
        rev: { type: Number },
        data: { type: "blob", nullable: true },
        createdAt: { type: Date, createDate: true },
        updatedAt: { type: Date, updateDate: true },
        isDeleted: { type: Boolean },
        permissions: { type: String },
        colrev: { type: Number }, // index ?
        colId: { type: String } // index ?
    },
    relations: {
        col: { type: "many-to-one", target: "collection" }
    }
})

const RefEntity = new EntitySchema<Ref>({
    name: "ref",
    columns: {
        id: { type: String, primary: true },
        isRemoved: { type: Boolean },
        colrev: { type: Number },
        colId: { type: String },
        docId: { type: String }
    },
    relations: {
        col: { type: "many-to-one", target: "collection" },
        doc: { type: "many-to-one", target: "document" }
    }
})

const CollectionEntity = new EntitySchema<Collection>({
    name: "collection",
    columns: {
        id: { type: "uuid", primary: true, generated: "uuid" },
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
        id: { type: "uuid", primary: true, generated: "uuid" }
    }
})

const GroupMemberEntity = new EntitySchema<GroupMember>({
    name: "group_member",
    columns: {
        id: { type: "uuid", primary: true, generated: "uuid" },
        user: { type: String },
        groupId: { type: String }
    },
    relations: {
        group: { type: "many-to-one", target: "group" }
    }
})

const entities = [
    DocumentEntity,
    CollectionEntity,
    GroupEntity,
    GroupMemberEntity
]

export { entities }
