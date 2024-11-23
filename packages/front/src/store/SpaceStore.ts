import {
    reaction,
    makeObservable,
    computed,
    observable,
    autorun,
    ObservableMap
} from "mobx"
import { fromPromise, IPromiseBasedObservable } from "mobx-utils"
import { v4 as uuidv4 } from "uuid"
import {
    SinkronCollection,
    Item,
    IndexedDbCollectionStore,
    ItemState
} from "@sinkron/client/lib/collection"
import { toLoro } from "@sinkron/loro-slate"
import { compareDesc } from "date-fns"
import { LoroDoc, LoroList, LoroMap } from "loro-crdt"
import { Node } from "slate"
import { without } from "lodash-es"

import { TitleElement, RootElement } from "~/types"
import env from "~/env"
import {
    Space,
    SpaceMember,
    Invite,
    SpaceRole,
    Metadata,
    Category
} from "~/entities"
import { Api } from "~/api"
import { TransformedMap } from "~/utils/transformedMap"

import UserStore from "./UserStore"

export type CategoryTreeNode = Category & {
    count: number
    children: CategoryTreeNode[]
}

export type CategoryTree = {
    map: { [key: string]: CategoryTreeNode }
    nodes: CategoryTreeNode[]
}

export type FetchMembersResponse = {
    members: SpaceMember[]
    invites: Invite[]
}

export type DocumentData = {
    isMeta: false
    categories: string[]
    isPublished: boolean
    isLocked: boolean
}

export type ExtractedData = Metadata | DocumentData

const extractDocumentData = (doc: LoroDoc): ExtractedData => {
    const root = doc.getMap("root")
    if (root.get("isMeta")) {
        return root.toJSON() as Metadata
    } else {
        return {
            isMeta: false,
            categories: root.get("categories") as string[],
            isPublished: root.get("isPublished") as boolean,
            isLocked: root.get("isLocked") as boolean
        }
    }
}

export type DocumentListItemData = {
    id: string
    item: Item<DocumentData>
    title: string
    subtitle: string | null
}

export type UploadState = {
    id: string
    content: Blob
    state: IPromiseBasedObservable<object>
}

const getTextPreview = (doc: LoroDoc) => {
    const result = { title: "", subtitle: "" }

    const content = doc.getMap("root").get("content")
    if (!(content instanceof LoroMap)) return result
    const children = content.get("children")
    if (!(children instanceof LoroList)) return result

    if (children.length > 0) {
        const firstChild = children.get(0).toJSON()
        for (const item of Node.texts(firstChild)) {
            const [text] = item
            result.title += text.text
            if (result.title.length >= 75) break
        }
    }

    if (children.length > 1) {
        outer: for (let i = 1; i < children.length; i++) {
            const child = children.get(i).toJSON()
            for (const item of Node.texts(child)) {
                const [text] = item
                result.subtitle += text.text + " "
                if (result.subtitle.length >= 75) break outer
            }
        }
    }

    return result
}

const getDocumentListItemData = (
    item: Item<DocumentData>
): DocumentListItemData => {
    const { title, subtitle } = getTextPreview(item.local!.doc)
    return { id: item.id, item, title, subtitle }
}

const getUpdatedAt = (item: Item<any>) =>
    item.state === ItemState.Synchronized
        ? item.updatedAt!
        : item.localUpdatedAt!

const createInitialDocument = (initialCategory: string | undefined) => {
    const doc = new LoroDoc()
    const root = doc.getMap("root")

    const title: TitleElement = { type: "title", children: [{ text: "" }] }
    const rootElem: RootElement = { children: [title] }
    root.setContainer("content", toLoro(rootElem as Node))

    const categories = initialCategory !== undefined ? [initialCategory] : []
    root.set("categories", categories)

    root.set("isPublished", false)
    root.set("isLocked", false)

    return doc
}

export type SpaceView =
    | { kind: "category"; id: string }
    | { kind: "published" }
    | { kind: "all" }

export type SpaceViewProps =
    | { kind: "published" | "all"; count: number; name: string }
    | ({ kind: "category" } & CategoryTreeNode)

class SpaceStore {
    space: Space
    store: UserStore
    collection: SinkronCollection<ExtractedData>
    loadedState: IPromiseBasedObservable<void>
    view: SpaceView = { kind: "all" }
    documentList: TransformedMap<Item<ExtractedData>, DocumentListItemData>
    api: Api
    dispose: () => void

    constructor(space: Space, store: UserStore) {
        this.api = store.api
        this.space = space
        this.store = store

        const col = `spaces/${space.id}`
        const collectionStore = new IndexedDbCollectionStore(col)
        const token = this.api.getToken() ?? ""
        this.collection = new SinkronCollection({
            url: env.wsUrl,
            token,
            col,
            store: collectionStore,
            errorHandler: () => {
                this.store.logout()
            },
            extractData: extractDocumentData
        })
        this.loadedState = fromPromise(
            new Promise<void>((resolve) => {
                reaction(
                    () => this.collection.isLoaded,
                    (value) => {
                        if (value) resolve()
                    }
                )
            })
        )

        this.documentList = new TransformedMap({
            source: this.collection.items as ObservableMap,
            filter: (item) => {
                if (item.data === undefined) return false
                if (item.data.isMeta) return false

                if (this.view.kind === "all") {
                    return true
                } else if (this.view.kind === "published") {
                    return item.data.isPublished
                } /* this.view.kind === "category" */ else {
                    return item.data.categories.includes(this.view.id)
                }
            },
            transform: getDocumentListItemData
        })

        makeObservable(this, {
            documents: computed,
            publishedDocuments: computed,
            sortedDocumentList: computed,
            metaItem: computed,
            meta: computed,
            view: observable,
            viewProps: computed,
            categoryTree: computed
        })

        // Reset view if current category being deleted
        const disposeAutorun = autorun(() => {
            if (this.view.kind === "category") {
                const list = Object.keys(this.meta.categories)
                if (!list.includes(this.view.id)) {
                    this.view = { kind: "all" }
                }
            }
        })

        this.dispose = () => {
            disposeAutorun()
            this.collection.destroy()
        }
    }

    updateSpace(space: Space) {
        this.space = space
    }

    get viewProps(): SpaceViewProps {
        const { kind } = this.view
        if (kind === "all") {
            return {
                kind: "all",
                name: "All documents",
                count: this.documents.length
            }
        } else if (kind === "published") {
            return {
                kind: "published",
                name: "Published documents",
                count: this.publishedDocuments.length
            }
        } /* kind === "category" */ else {
            const category = this.categoryTree.map[this.view.id]
            return { kind: "category", ...category }
        }
    }

    get documents(): Item<DocumentData>[] {
        return Array.from(this.collection.items.values()).filter(
            (item) => item.data !== undefined && !item.data.isMeta
        ) as Item<DocumentData>[]
    }

    get publishedDocuments() {
        const published = []
        for (const item of this.documents) {
            if (item.data?.isPublished) published.push(item)
        }
        return published
    }

    get sortedDocumentList() {
        return Array.from(this.documentList.map.values()).sort((a, b) =>
            compareDesc(getUpdatedAt(a.item), getUpdatedAt(b.item))
        )
    }

    get metaItem(): Item<Metadata> | undefined {
        for (const item of this.collection.items.values()) {
            if (item.data?.isMeta) return item as Item<Metadata>
        }
        return undefined
    }

    get meta(): Metadata {
        if (!this.metaItem || this.metaItem.local === null) {
            throw new Error("Metadata document not found!")
        }
        return this.metaItem.data!
    }

    changeMeta(cb: (m: LoroDoc) => void) {
        if (!this.metaItem || this.metaItem.local === null) {
            throw new Error("Metadata document not found!")
        }
        this.collection.change(this.metaItem.id, (doc) => {
            cb(doc)
        })
    }

    changeDoc(id: string, cb: (doc: LoroDoc) => void) {
        this.collection.change(id, cb)
    }

    createDocument() {
        const initialCategory =
            this.view.kind === "category" ? this.view.id : undefined
        const doc = createInitialDocument(initialCategory)
        const id = this.collection.create(doc)
        return id
    }

    // === Categories

    get categoryTree() {
        const map: { [key: string]: CategoryTreeNode } = {}

        const list = Object.values(this.meta.categories)
        list.forEach((c) => {
            map[c.id] = { ...c, count: 0, children: [] }
        })

        for (const item of this.documents) {
            const categories = item.data!.categories
            for (const i in categories) {
                map[categories[i]].count++
            }
        }

        const nodes: CategoryTreeNode[] = []
        list.forEach((c) => {
            const node = map[c.id]
            if (c.parent) {
                const parentNode = map[c.parent]
                parentNode.children.push(node)
            } else {
                nodes.push(node)
            }
        })

        return { map, nodes }
    }

    createCategory(data: { name: string; parent: string | null }) {
        const id = uuidv4()
        this.updateCategory(id, data)
        return id
    }

    updateCategory(id: string, data: { name: string; parent: string | null }) {
        this.changeMeta((meta) => {
            const root = meta.getMap("root")
            const categories = root.get("categories") as LoroMap
            categories.set(id, { id, ...data })
        })
    }

    deleteCategory(id: string) {
        this.changeMeta((meta) => {
            // TODO if deleted category has subcategories, change their parents
            const root = meta.getMap("root")
            const categories = root.get("categories") as LoroMap
            categories.delete(id)
        })

        this.collection.items.forEach((item) => {
            if (!item.data) return
            if (item.data.isMeta) return
            if (item.data.categories.includes(id)) {
                this.collection.change(item.id, (doc) => {
                    const root = doc.getMap("root")
                    const categories = root.get("categories") as string[]
                    root.set("categories", without(categories, id))
                })
            }
        })

        if (this.view.kind === "category" && this.view.id === id) {
            this.view = { kind: "all" }
        }
    }

    // === Members and invites

    fetchMembers() {
        return fromPromise(
            this.api.fetch<FetchMembersResponse>({
                method: "GET",
                url: `/spaces/${this.space.id}/members`
            })
        )
    }

    sendInvite(toEmail: string, role: string) {
        return fromPromise(
            this.api.fetch({
                method: "POST",
                url: "/invites/new",
                data: { spaceId: this.space.id, toEmail, role }
            })
        )
    }

    updateMember(userId: string, role: SpaceRole) {
        return fromPromise(
            this.api.fetch({
                method: "POST",
                url: `/spaces/${this.space.id}/members/${userId}/update`,
                data: { role }
            })
        )
    }

    removeMember(memberId: string) {
        return fromPromise(
            this.api.fetch({
                method: "POST",
                url: `/spaces/${this.space.id}/members/${memberId}/remove`
            })
        )
    }

    cancelInvite(inviteId: string) {
        return fromPromise(
            this.api.fetch({
                method: "POST",
                url: `/invites/${inviteId}/cancel`
            })
        )
    }

    // === Space settings

    renameSpace(name: string) {
        const res = fromPromise(
            this.api.fetch({
                method: "POST",
                url: `/spaces/${this.space.id}/rename`,
                data: { name }
            })
        )
        res.then(() => {
            this.space.name = name
        })
        return res
    }

    // === File uploads

    uploadQueue: Map<string, UploadState> = new Map()

    upload(content: Blob): UploadState {
        const id = uuidv4()
        const state = fromPromise(
            this.api.fetch({
                method: "POST",
                url: `/spaces/${this.space.id}/upload_image/${id}`,
                data: content
            })
        )
        state.then(() => {
            this.uploadQueue.delete(id)
        })
        const uploadState = { id, content, state }
        this.uploadQueue.set(id, uploadState)
        return uploadState
    }

    deleteOrphans() {
        const res = fromPromise(
            this.api.fetch({
                method: "POST",
                url: `/spaces/${this.space.id}/delete_orphans`
            })
        )
        res.then((res) => {
            if ("usedStorage" in res && typeof res.usedStorage === "number") {
                this.space.usedStorage = res.usedStorage
            }
        })
        return res
    }

    // Lock & unlock

    lockDocument(docId: string) {
        const res = fromPromise(
            this.api.fetch({
                method: "POST",
                url: `/spaces/${this.space.id}/lock/${docId}`
            })
        )
        return res
    }

    unlockDocument(docId: string) {
        const res = fromPromise(
            this.api.fetch({
                method: "POST",
                url: `/spaces/${this.space.id}/unlock/${docId}`
            })
        )
        return res
    }
}

export default SpaceStore
