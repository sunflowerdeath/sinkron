import { DataSource, Repository, MoreThan, FindOptionsSelect } from "typeorm"
import { v4 as uuidv4 } from "uuid"
import * as Automerge from "@automerge/automerge"
import { LRUCache } from "lru-cache"

import { createDataSource } from "./db"
import type { Document, Collection, Ref, Group, GroupMember } from "./entities"
import { Result, ResultType } from "./result"
import { Permissions, PermissionsTable, Action } from "./permissions"
import { ErrorCode } from "./protocol"
import type { DbConfig } from "./db"

export type CollectionView = {
    id: string
    colrev: number
    ref: boolean
}

export type DocumentView = {
    id: string
    data: Uint8Array | null
    col: string
    colrev: number
    createdAt: Date
    updatedAt: Date
}

export type SyncCollectionResult = {
    col: string
    colrev: number
    documents: DocumentView[]
}

export type CreateCollectionProps = {
    id: string
    permissions: PermissionsTable
    ref?: boolean
}

export type UpdateResult = {
    doc: DocumentView
    changes: Uint8Array[]
}

export type CheckPermissionProps = {
    id: string
    action: Action
    user: string
}

type UserObject = { id: string; groups: string[] }

type Colrevs = Array<{ id: string; colrev: number }>

export type RequestError = { code: ErrorCode; details?: string }

export type SinkronProps = {
    db: DbConfig
}

type SinkronModels = {
    documents: Repository<Document>
    collections: Repository<Collection>
    refs: Repository<Ref>
    groups: Repository<Group>
    members: Repository<GroupMember>
}

class Sinkron {
    constructor(props: SinkronProps) {
        const { db } = props
        this.db = createDataSource(db)
        this.cache = new LRUCache({ max: 1000 })
        this.userCache = new LRUCache({ max: 1000 })
        this.models = {
            documents: this.db.getRepository<Document>("document"),
            collections: this.db.getRepository<Collection>("collection"),
            refs: this.db.getRepository<Ref>("ref"),
            groups: this.db.getRepository<Group>("group"),
            members: this.db.getRepository<GroupMember>("group_member")
        }
    }

    db: DataSource
    cache: LRUCache<string, DocumentView>
    userCache: LRUCache<string, UserObject>
    models: SinkronModels

    async init() {
        await this.db.initialize()
    }

    // === Collections ===

    async getCollection(id: string): Promise<CollectionView | null> {
        const models = this.models
        const res = await models.collections.findOne({
            where: { id },
            select: { id: true, colrev: true, ref: true }
        })
        return res
    }

    async createCollection(
        props: CreateCollectionProps
    ): Promise<ResultType<CollectionView, RequestError>> {
        const { id, permissions, ref = false } = props
        const models = this.models

        const count = await models.collections.countBy({ id })
        if (count > 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Duplicate col id"
            })
        }

        await models.collections.insert({
            id,
            colrev: 1,
            permissions: JSON.stringify(permissions),
            ref
        })

        const col = { id, colrev: 1, ref }
        return Result.ok(col)
    }

    async #syncDocCollection(
        colEntity: Collection,
        colrev?: number
    ): Promise<ResultType<SyncCollectionResult, RequestError>> {
        const models = this.models

        const result = { col: colEntity.id, colrev: colEntity.colrev }

        const select: FindOptionsSelect<Document> = {
            id: true,
            data: true,
            colrev: true,
            createdAt: true,
            updatedAt: true
        }

        if (colrev === undefined) {
            // Get all documents except deleted
            const documents = await models.documents.find({
                where: { colId: colEntity.id, isDeleted: false },
                select
            })
            return Result.ok({
                ...result,
                documents: documents.map((d) => ({
                    id: d.id,
                    data: d.data,
                    createdAt: d.createdAt,
                    updatedAt: d.updatedAt,
                    col: d.colId,
                    colrev: d.colrev
                }))
            })
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
        const documents = await models.documents.find({
            where: { colId: colEntity.id, colrev: MoreThan(colrev) },
            select: { ...select, isDeleted: true }
        })
        const views = documents.map((d) => ({
            id: d.id,
            data: d.data,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            col: d.colId,
            colrev: d.colrev
        }))
        return Result.ok({ ...result, documents: views })
    }

    async #syncRefCollection(
        colEntity: Collection,
        colrev?: number
    ): Promise<ResultType<SyncCollectionResult, RequestError>> {
        const models = this.models

        const result = { col: colEntity.id, colrev: colEntity.colrev }

        const select = {
            colrev: true,
            doc: {
                id: true,
                data: true,
                createdAt: true,
                updatedAt: true
            }
        }

        if (colrev === undefined) {
            // Get all refs except removed
            const refs = await models.refs.find({
                where: { colId: colEntity.id, isRemoved: false },
                select,
                relations: { doc: true }
            })
            const documents = refs.map((ref) => ({
                ...ref.doc,
                col: colEntity.id
            }))
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

        // Get refs since provided colrev including removed
        const refs = await models.refs.find({
            where: { colId: colEntity.id, colrev: MoreThan(colrev) },
            select,
            relations: { doc: true }
        })
        // TODO colrevs
        const documents = refs.map((ref) =>
            ref.isRemoved
                ? { ...ref.doc, data: null, col: colEntity.id }
                : { ...ref.doc, col: colEntity.id }
        )
        return Result.ok({ ...result, documents })
    }

    async syncCollection(
        col: string,
        colrev?: number
    ): Promise<ResultType<SyncCollectionResult, RequestError>> {
        const models = this.models

        const colEntity = await models.collections.findOne({
            where: { id: col },
            select: { id: true, colrev: true, ref: true }
        })
        if (colEntity === null) return Result.err({ code: ErrorCode.NotFound })

        return colEntity.ref
            ? this.#syncRefCollection(colEntity, colrev)
            : this.#syncDocCollection(colEntity, colrev)
    }

    async addDocumentToCollection(
        col: string,
        doc: string
    ): Promise<ResultType<true, RequestError>> {
        const models = this.models

        const colEntity = await models.collections.findOne({
            where: { id: col },
            select: { colrev: true, permissions: true, ref: true }
        })
        if (colEntity === null) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Collection not found"
            })
        }
        if (colEntity.ref !== true) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Only ref collections support adding documents"
            })
        }

        const docCount = await models.documents.countBy({ id: doc })
        if (docCount === 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Document not found"
            })
        }

        const refCount = await models.refs.countBy({ docId: doc, colId: col })
        if (refCount !== 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Document is already in collection"
            })
        }

        // TODO increment RETURNING ?
        const nextColrev = colEntity.colrev + 1
        await models.collections.update(col, { colrev: nextColrev })
        const id = uuidv4()
        await models.refs.insert({
            id,
            docId: doc,
            colId: col,
            colrev: nextColrev,
            isRemoved: false
        })
        return Result.ok(true)
    }

    async removeDocumentFromCollection(
        col: string,
        doc: string
    ): Promise<ResultType<true, RequestError>> {
        const models = this.models

        const ref = await models.refs.findOne({
            where: { colId: col, docId: doc },
            select: { id: true, col: { colrev: true } },
            relations: { col: true }
        })
        if (ref === null) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Ref not found"
            })
        }

        // TODO increment RETURNING ?
        const nextColrev = ref.col.colrev + 1
        await models.collections.update(col, { colrev: nextColrev })
        await models.refs.update(ref.id, {
            colrev: nextColrev,
            isRemoved: true
        })
        return Result.ok(true)
    }

    async deleteCollection(
        _id: string
    ): Promise<ResultType<true, RequestError>> {
        // TODO
        return Result.ok(true)
    }

    // === Documents ===

    async getDocument(id: string): Promise<DocumentView | null> {
        const cached = this.cache.get(id)
        if (cached !== undefined) return cached

        const models = this.models
        const select: FindOptionsSelect<Document> = {
            id: true,
            rev: true,
            data: true,
            colId: true,
            colrev: true,
            createdAt: true,
            updatedAt: true
        }
        const res = await models.documents.findOne({
            where: { id },
            select
        })
        if (res === null) return res
        const view = {
            id: res.id,
            data: res.data,
            col: res.colId,
            colrev: res.colrev,
            createdAt: res.createdAt,
            updatedAt: res.updatedAt
        }
        return view
    }

    async createDocument(
        id: string,
        col: string,
        data: Uint8Array
    ): Promise<ResultType<DocumentView, RequestError>> {
        const models = this.models

        const docCnt = await models.documents.countBy({ id })
        if (docCnt > 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Duplicate doc id: " + id
            })
        }

        const colEntity = await models.collections.findOne({
            where: { id: col },
            select: { colrev: true, permissions: true, ref: true }
        })
        if (colEntity === null) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Collection not found"
            })
        }
        if (colEntity.ref === true) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Ref collections don't support creating documents"
            })
        }

        // increment colrev
        // TODO raw with RETURNING ?
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
        const insertRes = await models.documents.insert({
            id,
            data,
            rev: 1,
            colId: col,
            isDeleted: false,
            colrev: nextColrev,
            permissions: JSON.stringify(docPermissions)
        })
        const { createdAt, updatedAt } = insertRes.generatedMaps[0]
        const view = {
            id,
            data,
            col,
            colrev: nextColrev,
            createdAt,
            updatedAt
        }
        this.cache.set(id, view)
        return Result.ok(view)
    }

    async #incrementRefColrevs(
        id: string,
        isRemoved: boolean
    ): Promise<ResultType<Colrevs, RequestError>> {
        const models = this.models

        const colrevs = []
        const refs = await models.refs.find({
            where: { docId: id },
            select: { id: true, col: { id: true, colrev: true } },
            relations: { col: true }
        })
        for (const i in refs) {
            const ref = refs[i]
            const nextColrev = ref.col.colrev + 1
            await models.refs.update(ref.id, { colrev: nextColrev, isRemoved })
            await models.collections.update(ref.col.id, { colrev: nextColrev })
            colrevs.push({ id: ref.col.id, colrev: nextColrev })
        }

        return Result.ok(colrevs)
    }

    async #incrementColrev(
        id: string
    ): Promise<ResultType<number, RequestError>> {
        const models = this.models
        const col = await models.collections.findOne({
            where: { id },
            select: { colrev: true }
        })
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

    async #updateDocumentEntity(
        doc: DocumentView,
        update: { data?: Uint8Array | null; isDeleted?: boolean }
    ): Promise<ResultType<DocumentView, RequestError>> {
        const models = this.models

        const incrementColrevRes = await this.#incrementColrev(doc.col)
        if (!incrementColrevRes.isOk) return incrementColrevRes
        const nextColrev = incrementColrevRes.value

        // TODO returning ?
        await models.documents.update(doc.id, {
            ...update,
            colrev: nextColrev
        })
        const { updatedAt } = (await models.documents.findOne({
            where: { id: doc.id },
            select: { updatedAt: true }
        }))!

        const incrementRefColrevsRes = await this.#incrementRefColrevs(
            doc.id,
            /* isRemoved */ update.data === null
        )
        if (!incrementRefColrevsRes.isOk) return incrementRefColrevsRes
        // TODO return colrev
        const colrevs = [
            { col: doc.col, colrev: nextColrev },
            ...incrementRefColrevsRes.value
        ]

        const updated: DocumentView = {
            ...doc,
            ...update,
            colrev: nextColrev,
            updatedAt
        }
        this.cache.set(doc.id, updated)

        // TODO return updated ref collections (but do not cache?)
        return Result.ok(updated)
    }

    async updateDocument(
        id: string,
        data: Uint8Array[] | null
    ): Promise<ResultType<DocumentView, RequestError>> {
        const doc = await this.getDocument(id)
        if (doc === null) return Result.err({ code: ErrorCode.NotFound })
        if (doc.data === null) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Unable to update deleted document"
            })
        }

        // Delete document
        if (data === null) {
            const updateResult = await this.#updateDocumentEntity(doc, {
                data: null,
                isDeleted: true
            })
            return updateResult
        }

        let automerge = Automerge.load(doc.data)
        try {
            ;[automerge] = Automerge.applyChanges(automerge, data)
        } catch {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Unable to apply changes"
            })
        }
        const nextData = Automerge.save(automerge)

        const updateResult = await this.#updateDocumentEntity(doc, {
            data: nextData
        })
        return updateResult
    }

    async updateDocumentWithCallback<T>(
        id: string,
        cb: Automerge.ChangeFn<T>
    ): Promise<ResultType<UpdateResult, RequestError>> {
        const doc = await this.getDocument(id)
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
        } catch {
            return Result.err({
                code: ErrorCode.InternalServerError,
                details: "Unable to apply changes"
            })
        }

        const change = Automerge.getLastLocalChange(automerge)
        if (change === undefined) {
            // nothing changed
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Empty change"
            })
        }

        const nextData = Automerge.save(automerge)
        const updateRes = await this.#updateDocumentEntity(doc, {
            data: nextData
        })
        if (!updateRes.isOk) return updateRes

        return Result.ok({ doc: updateRes.value, changes: [change] })
    }

    deleteDocument(
        id: string
    ): Promise<ResultType<DocumentView, RequestError>> {
        return this.updateDocument(id, null)
    }

    // === Permissions ===

    async updateCollectionPermissions(
        col: string,
        cb: (p: Permissions) => void
    ): Promise<ResultType<true, RequestError>> {
        const models = this.models

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

    async updateDocumentPermissions(
        id: string,
        cb: (p: Permissions) => void
    ): Promise<ResultType<true, RequestError>> {
        const models = this.models

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

    async #getUserObject(user: string): Promise<UserObject> {
        const cached = this.userCache.get(user)
        if (cached !== undefined) return cached

        const models = this.models
        const members = await models.members.find({
            where: { user },
            select: { groupId: true }
        })
        const userObject = { id: user, groups: members.map((g) => g.groupId) }
        this.userCache.set(user, userObject)
        return userObject
    }

    async checkDocumentPermission(
        props: CheckPermissionProps
    ): Promise<ResultType<boolean, RequestError>> {
        const models = this.models
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

        const userObject = await this.#getUserObject(user)
        const permissions = Permissions.parse(doc.permissions)
        const res = permissions.check(userObject, action)
        return Result.ok(res)
    }

    async checkCollectionPermission(
        props: CheckPermissionProps
    ): Promise<ResultType<boolean, RequestError>> {
        const models = this.models
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

        const userObject = await this.#getUserObject(user)
        const permissions = Permissions.parse(col.permissions)
        const res = permissions.check(userObject, action)
        return Result.ok(res)
    }

    // Groups
    // ------

    async createGroup(id: string): Promise<ResultType<Group, RequestError>> {
        const models = this.models
        const count = await models.groups.countBy({ id })
        if (count > 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Duplicate id"
            })
        }

        await models.groups.insert({ id })
        return Result.ok({ id } as Group)
    }

    async deleteGroup(id: string): Promise<ResultType<true, RequestError>> {
        const models = this.models

        const count = await models.collections.countBy({ id })
        if (count === 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Group not exist"
            })
        }

        await models.members.delete({ groupId: id })
        await models.groups.delete({ id })

        return Result.ok(true)
    }

    async addMemberToGroup(
        user: string,
        group: string
    ): Promise<ResultType<true, RequestError>> {
        const models = this.models

        const count = await models.groups.countBy({ id: group })
        if (count === 0) {
            return Result.err({
                code: ErrorCode.InvalidRequest,
                details: "Group not exist"
            })
        }

        await models.members.insert({ user, groupId: group })
        this.userCache.delete(user)
        return Result.ok(true)
    }

    async removeMemberFromGroup(
        user: string,
        group: string
    ): Promise<ResultType<true, RequestError>> {
        const models = this.models
        await models.members.delete({ user, groupId: group })
        this.userCache.delete(user)
        return Result.ok(true)
    }
}

export { Sinkron }
