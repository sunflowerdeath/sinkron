import { EntitySchema } from 'typeorm'

export type Document = {
    id: string
    createdAt: Date
    updatedAt: Date
    rev: number
    data: Uint8Array | null
    owner: string
    permissions: string
    isDeleted: boolean
    colId: string
    col: Collection
    colrev: number
}

export type Collection = {
    id: string
    createdAt: Date
    updatedAt: Date
    colrev: number
    owner: string
}

export type Group = {
    id: string
    name: string
}

export type GroupMember = {
    id: string
    user: string
    group: Group
}

const DocumentEntity = new EntitySchema<Document>({
    name: 'document',
    columns: {
        id: { type: String, primary: true },
        rev: { type: Number },
        data: { type: 'blob', nullable: true },
        createdAt: { type: Date, createDate: true },
        updatedAt: { type: Date, updateDate: true },
        isDeleted: { type: Boolean },
        permissions: { type: String },
        colrev: { type: Number }, // index ?
        colId: { type: String } // index ?
    },
    relations: {
        // owner: { type: "many-to-one", target: "user" },
        col: { type: 'many-to-one', target: 'collection' }
    }
})

const CollectionEntity = new EntitySchema<Collection>({
    name: 'collection',
    columns: {
        id: { type: 'uuid', primary: true, generated: 'uuid' },
        createdAt: { type: Date, createDate: true },
        updatedAt: { type: Date, updateDate: true },
        colrev: { type: Number }
    }
    // relations: {
    // entries: { type: "one-to-many", target: "entry" },
    // },
})

const GroupEntity = new EntitySchema<Group>({
    name: 'group',
    columns: {
        id: { type: 'uuid', primary: true, generated: 'uuid' }
    }
})

const GroupMemberEntity = new EntitySchema<GroupMember>({
    name: 'group_member',
    columns: {
        id: { type: 'uuid', primary: true, generated: 'uuid' },
        user: { type: String }
    },
    relations: {
        group: { type: 'many-to-one', target: 'group' }
    }
})

const entities = [
    DocumentEntity,
    CollectionEntity,
    GroupEntity,
    GroupMemberEntity
]

export { entities }
