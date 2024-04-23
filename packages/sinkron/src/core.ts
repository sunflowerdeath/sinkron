import {
    EntitySchema,
    DataSource,
    Repository,
    MoreThan,
    MoreThanOrEqual,
    EntityManager
} from "typeorm"
import { without, remove, isEqual, uniq } from "lodash"
import { v4 as uuidv4 } from "uuid"
import * as Automerge from "@automerge/automerge"
import pino from "pino"

import { entities } from "./entities"
import type { Document, Collection, Group, GroupMember } from "./entities"
import { Result, ResultType } from "./result"
import {
    Permissions,
    emptyPermissionsTable,
    PermissionsTable,
    Action
} from "./permissions"
import {
    ErrorCode,
    SyncMessage,
    SyncErrorMessage,
    SyncCompleteMessage,
    Op,
    ChangeMessage,
    ModifyMessage,
    CreateMessage,
    DeleteMessage,
    ErrorMessage,
    DocMessage,
    ClientMessage
} from "./protocol"

type CreateCollectionProps = {
    id: string
    permissions: PermissionsTable
}

type CreateDocumentProps = {
    id: string
    data: Uint8Array
    permissions: Permissions
    col?: string
}

type UpdateDocumentProps = {
    id: string
    changes: Uint8Array[]
    permissions: Permissions
}

type UpdateDocumentWithCallbackProps = {
    id: string
    callback: (doc: any) => void
}

type CheckPermissionProps = {
    id: string
    action: Action
    user: string
}

type ChangedDocuments = {
    col: string
    colrev: number
    documents: Document[]
}

export type RequestError = { code: ErrorCode; details?: string }

interface SinkronProps {
    dbPath: string
}

class Sinkron {
    constructor(props: SinkronProps) {
        const { dbPath } = props
        this.db = new DataSource({
            type: "better-sqlite3",
            database: dbPath,
            entities,
            synchronize: true,
            // logging: ['query', 'error']
            logging: ["error"]
        })
        this.models = {
            documents: this.db.getRepository("document"),
            collections: this.db.getRepository("collection"),
            groups: this.db.getRepository("group"),
            members: this.db.getRepository("group_member")
        }
    }

    db: DataSource

    models: {
        documents: Repository<Document>
        collections: Repository<Collection>
        groups: Repository<Group>
        members: Repository<GroupMember>
    }

    async init() {
        await this.db.initialize()
    }

    getModels(m: EntityManager) {
        return {
            documents: m.getRepository("document"),
            collections: m.getRepository("collection"),
            groups: m.getRepository("group"),
            members: m.getRepository("group_member")
        }
    }

    async getDocumentTr(m: EntityManager, id: string) {
        const models = this.getModels(m)
        const select = {
            id: true,
            rev: true,
            data: true,
            colId: true,
            createdAt: true,
            updatedAt: true
        }
        const res = await models.documents.findOne({
            where: { id },
            select
        })
        return res as Document | null
    }

    async createCollectionTr(
        m: EntityManager,
        props: CreateCollectionProps
    ): Promise<ResultType<Collection, RequestError>> {
        const { id, permissions } = props

        const models = this.getModels(m)
        const count = await models.collections.countBy({ id })
        if (count > 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Duplicate id"
            })
        }

        await models.collections.insert({
            id,
            colrev: 1,
            permissions: JSON.stringify(permissions)
        })
        // TODO generated fields
        const col = { id, colrev: 1 }

        return Result.ok(col as Collection)
    }

    async syncCollectionTr(
        m: EntityManager,
        col: string,
        colrev?: number
    ): Promise<ResultType<ChangedDocuments, RequestError>> {
        const models = this.getModels(m)

        const colEntity = await models.collections.findOne({
            where: { id: col },
            select: { colrev: true }
        })
        if (colEntity === null) return Result.err({ code: ErrorCode.NotFound })

        const result = { col, colrev: colEntity.colrev }

        const select = {
            id: true,
            data: true,
            colrev: true,
            createdAt: true,
            updatedAt: true
        }

        if (colrev === undefined) {
            // Get all documents except deleted
            const documents = (await models.documents.find({
                where: { colId: col, isDeleted: false },
                select
            })) as Document[]
            return Result.ok({ ...result, documents })
        }

        if (colrev < 0 || colrev > colEntity.colrev) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Invalid colrev"
            })
        }

        if (colEntity.colrev === colrev) {
            return Result.ok({ ...result, documents: [] })
        }

        // Get documents since provided colrev including deleted
        const documentsRows = (await models.documents.find({
            where: { colId: col, colrev: MoreThan(colrev) },
            select: { ...select, isDeleted: true }
        })) as Document[]
        const documents = documentsRows.map((d) =>
            d.isDeleted
                ? ({
                      id: d.id,
                      data: null,
                      createdAt: d.createdAt,
                      updatedAt: d.updatedAt,
                      col: d.col
                  } as any as Document)
                : d
        )
        return Result.ok({ ...result, documents })
    }

    async createDocumentTr(
        m: EntityManager,
        id: string,
        col: string,
        data: Uint8Array
    ): Promise<ResultType<Document, RequestError>> {
        const models = this.getModels(m)

        const docCnt = await models.documents.countBy({ id })
        if (docCnt > 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Duplicate id"
            })
        }

        const colEntity = await models.collections.findOne({
            where: { id: col },
            select: { colrev: true, permissions: true }
        })
        if (colEntity === null) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Collection not found"
            })
        }

        // increment colrev
        const nextColrev = colEntity.colrev + 1
        await models.collections.update(col, { colrev: nextColrev })

        // create document
        const colPermissions = Permissions.parse(colEntity.permissions)
        const docPermissions = {
            create: [],
            read: [],
            delete: [],
            update: colPermissions.table.update
        }
        const doc = {
            id,
            data,
            rev: 1,
            colId: col,
            isDeleted: false,
            colrev: nextColrev,
            permissions: JSON.stringify(docPermissions)
        }
        await models.documents.insert(doc)

        const generated = await models.documents.findOne({
            where: { id },
            select: { createdAt: true, updatedAt: true }
        })
        const result = { ...doc, ...generated } as Document
        return Result.ok(result)
    }

    async incrementColrevTr(
        m: EntityManager,
        id: string
    ): Promise<ResultType<number, RequestError>> {
        const models = this.getModels(m)
        const col = await models.collections.findOneBy({ id })
        if (col === null) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Collection not found"
            })
        }
        const nextColrev = col.colrev + 1
        await models.collections.update(id, { colrev: nextColrev })
        return Result.ok(nextColrev)
    }

    async updateDocumentEntityTr(
        m: EntityManager,
        doc: Document,
        update: Partial<Document>
    ): Promise<ResultType<Document, RequestError>> {
        const models = this.getModels(m)

        const incrementColrevResult = await this.incrementColrevTr(m, doc.colId)
        if (!incrementColrevResult.isOk) return incrementColrevResult
        const nextColrev = incrementColrevResult.value

        await models.documents.update(doc.id, { ...update, colrev: nextColrev })
        const { updatedAt } = (await models.documents.findOne({
            where: { id: doc.id },
            select: { updatedAt: true }
        }))!

        return Result.ok({ ...doc, ...update, colrev: nextColrev, updatedAt })
    }

    async updateDocumentTr(
        m: EntityManager,
        id: string,
        data: Uint8Array[] | null
    ): Promise<ResultType<Document, RequestError>> {
        const models = this.getModels(m)

        const doc = await this.getDocumentTr(m, id)
        if (doc === null) return Result.err({ code: ErrorCode.NotFound })
        if (doc.data === null) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Unable to update deleted document"
            })
        }

        // Delete document
        if (data === null) {
            const updateResult = await this.updateDocumentEntityTr(m, doc, {
                data: null,
                isDeleted: true
            })
            return updateResult
        }

        // TODO cache?
        let automerge = Automerge.load(doc.data)
        try {
            ;[automerge] = Automerge.applyChanges(automerge, data)
        } catch (e) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Unable to apply changes"
            })
        }
        const nextData = Automerge.save(automerge)
        const updateResult = await this.updateDocumentEntityTr(m, doc, {
            data: nextData
        })
        return updateResult
    }

    async updateDocumentWithCallbackTr<T>(
        m: EntityManager,
        id: string,
        cb: Automerge.ChangeFn<T>
    ): Promise<ResultType<Document, RequestError>> {
        const models = this.getModels(m)

        const doc = await this.getDocumentTr(m, id)
        if (doc === null) return Result.err({ code: ErrorCode.NotFound })
        if (doc.data === null) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Unable to update deleted document"
            })
        }

        let automerge = Automerge.load<T>(doc.data)
        try {
            automerge = Automerge.change(automerge, cb)
        } catch (e) {
            return Result.err({
                code: ErrorCode.InternalServerError,
                details: "Unable to apply changes"
            })
        }
        const nextData = Automerge.save(automerge)

        return await this.updateDocumentEntityTr(m, doc, { data: nextData })
    }

    async updateCollectionPermissionsTr(
        m: EntityManager,
        col: string,
        cb: (p: Permissions) => void
    ): Promise<ResultType<true, RequestError>> {
        const models = this.getModels(m)

        const colEntity = await models.collections.findOne({
            where: { id: col },
            select: { permissions: true }
        })
        if (colEntity === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                details: "Collection not found"
            })
        }

        const permissions = Permissions.parse(colEntity.permissions)
        cb(permissions)
        await models.collections.update(col, {
            permissions: permissions.stringify()
        })
        return Result.ok(true)
    }

    async updateDocumentPermissionsTr(
        m: EntityManager,
        id: string,
        cb: (p: Permissions) => void
    ): Promise<ResultType<true, RequestError>> {
        const models = this.getModels(m)

        const doc = await models.documents.findOne({
            where: { id },
            select: { permissions: true }
        })
        if (doc === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                details: "Document not found"
            })
        }

        const permissions = Permissions.parse(doc.permissions)
        cb(permissions)
        await models.documents.update(id, {
            permissions: permissions.stringify()
        })
        return Result.ok(true)
    }

    async getUserObject(m: EntityManager, user: string) {
        const models = this.getModels(m)
        const members = await models.members.find({
            where: { user },
            select: { groupId: true }
        })
        return { id: user, groups: members.map((g) => g.groupId) }
    }

    async checkDocumentPermissionTr(
        m: EntityManager,
        props: CheckPermissionProps
    ): Promise<ResultType<boolean, RequestError>> {
        const models = this.getModels(m)
        const { id, action, user } = props

        const doc = await models.documents.findOne({
            where: { id },
            select: { permissions: true }
        })
        if (doc === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                details: "Document not found"
            })
        }

        const userObject = await this.getUserObject(m, user)
        const permissions = Permissions.parse(doc.permissions)
        const res = permissions.check(userObject, action)
        return Result.ok(res)
    }

    async checkCollectionPermissionTr(
        m: EntityManager,
        props: CheckPermissionProps
    ): Promise<ResultType<boolean, RequestError>> {
        const models = this.getModels(m)
        const { id, action, user } = props

        const col = await models.collections.findOne({
            where: { id },
            select: { permissions: true }
        })
        if (col === null) {
            return Result.err({
                code: ErrorCode.NotFound,
                details: "Collection not found"
            })
        }

        const userObject = await this.getUserObject(m, user)
        const permissions = Permissions.parse(col.permissions)
        const res = permissions.check(userObject, action)
        return Result.ok(res)
    }

    // ==========
    // Public API
    // ==========

    // Collections
    // -----------

    createCollection(
        props: CreateCollectionProps
    ): Promise<ResultType<Collection, RequestError>> {
        return this.db.transaction((m) => this.createCollectionTr(m, props))
    }

    getCollection(id: string): Promise<Collection | null> {
        return this.db.transaction(async (m) => {
            const models = this.getModels(m)
            const select = { id: true, colrev: true }
            const colEntity = await models.collections.findOne({
                where: { id },
                select
            })
            return colEntity as Collection
        })
    }

    async deleteCollection(
        id: string
    ): Promise<ResultType<true, RequestError>> {
        // TODO
        return Result.ok(true)
    }

    getDocument(id: string): Promise<Document | null> {
        return this.db.transaction((m) => this.getDocumentTr(m, id))
    }

    syncCollection(
        col: string,
        colrev?: number
    ): Promise<ResultType<ChangedDocuments, RequestError>> {
        return this.db.transaction((m) => this.syncCollectionTr(m, col, colrev))
    }

    // Documents
    // ---------

    createDocument(
        id: string,
        col: string,
        data: Uint8Array
    ): Promise<ResultType<Document, RequestError>> {
        return this.db.transaction((tr) =>
            this.createDocumentTr(tr, id, col, data)
        )
    }

    updateDocument(
        id: string,
        data: Uint8Array[] | null
    ): Promise<ResultType<Document, RequestError>> {
        return this.db.transaction((m) => this.updateDocumentTr(m, id, data))
    }

    updateDocumentWithCallback<T>(
        id: string,
        cb: Automerge.ChangeFn<T>
    ): Promise<ResultType<Document, RequestError>> {
        return this.db.transaction((m) =>
            this.updateDocumentWithCallbackTr(m, id, cb)
        )
    }

    deleteDocument(id: string): Promise<ResultType<Document, RequestError>> {
        return this.updateDocument(id, null)
    }

    // Permissions
    // -----------

    updateCollectionPermissions(
        col: string,
        cb: (p: Permissions) => void
    ): Promise<ResultType<true, RequestError>> {
        return this.db.transaction((m) =>
            this.updateCollectionPermissionsTr(m, col, cb)
        )
    }

    updateDocumentPermissions(
        id: string,
        cb: (p: Permissions) => void
    ): Promise<ResultType<true, RequestError>> {
        return this.db.transaction((m) =>
            this.updateDocumentPermissionsTr(m, id, cb)
        )
    }

    checkDocumentPermission(
        props: CheckPermissionProps
    ): Promise<ResultType<boolean, RequestError>> {
        return this.db.transaction((m) =>
            this.checkDocumentPermissionTr(m, props)
        )
    }

    checkCollectionPermission(
        props: CheckPermissionProps
    ): Promise<ResultType<boolean, RequestError>> {
        return this.db.transaction((m) =>
            this.checkCollectionPermissionTr(m, props)
        )
    }

    // Groups
    // ------

    async createGroup(id: string): Promise<ResultType<Group, RequestError>> {
        return this.db.transaction(async (m) => {
            const models = this.getModels(m)
            const count = await models.collections.countBy({ id })
            if (count > 0) {
                return Result.err({
                    code: ErrorCode.InvalidRequest,
                    details: "Duplicate id"
                })
            }

            const res = await models.groups.insert({ id })
            return Result.ok({ id } as Group)
        })
    }

    async deleteGroup(id: string): Promise<ResultType<true, RequestError>> {
        return this.db.transaction(async (m) => {
            const models = this.getModels(m)

            const count = await models.collections.countBy({ id })
            if (count === 0) {
                return Result.err({
                    code: ErrorCode.InvalidRequest,
                    details: "Group not exist"
                })
            }

            await models.members.delete({ group: id })
            await models.groups.delete({ id })

            return Result.ok(true)
        })
    }

    async addMemberToGroup(
        user: string,
        group: string
    ): Promise<ResultType<true, RequestError>> {
        return this.db.transaction(async (m) => {
            const models = this.getModels(m)

            const count = await models.collections.countBy({ id: group })
            if (count === 0) {
                return Result.err({
                    code: ErrorCode.InvalidRequest,
                    details: "Group not exist"
                })
            }

            const res = await models.members.insert({ user, group })
            return Result.ok(true)
        })
    }

    async removeMemberFromGroup(
        user: string,
        group: string
    ): Promise<ResultType<true, RequestError>> {
        return this.db.transaction(async (m) => {
            const models = this.getModels(m)

            const res = await models.members.delete({ user, group })
            return Result.ok(true)
        })
    }
}

export { Sinkron }
