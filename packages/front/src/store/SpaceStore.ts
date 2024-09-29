import { reaction, makeObservable, computed, observable } from "mobx"
import { fromPromise, IPromiseBasedObservable } from "mobx-utils"
import { v4 as uuidv4 } from "uuid"
import { without } from "lodash-es"
import {
    Collection,
    Item,
    WebSocketTransport,
    IndexedDbCollectionStore,
    ItemState
} from "sinkron-client"
import { compareDesc } from "date-fns"
import { Node, Path } from "slate"

import env from "../env"
import { Space, Document, Category, Metadata } from "../entities"
import { toAutomerge, AutomergeNode } from "../slate"
import { Api } from "../api"
import { TransformedMap } from "../utils/transformedMap"

import UserStore from "./UserStore"

export type CategoryTreeNode = Category & {
    count: number
    children: CategoryTreeNode[]
}

export type CategoryTree = {
    map: { [key: string]: CategoryTreeNode }
    nodes: CategoryTreeNode[]
}

export type DocumentListItemData = {
    id: string
    item: Item<Document>
    categories: string[]
    title: string
    subtitle: string | null
}

type UploadState = {
    id: string
    content: Blob
    state: IPromiseBasedObservable<object>
}

// Implementation of Node.nodes that works with Automerge doc
const nodes = function* (root: AutomergeNode, from?: Path) {
    let n = root
    let p: Path = []
    const visited = new Set()
    while (true) {
        yield n

        // go down
        if (!visited.has(n) && "children" in n && n.children.length >= 0) {
            visited.add(n)
            const nextIndex =
                from && Path.isAncestor(p, from) ? from[p.length] : 0
            p = [...p, nextIndex]
            n = Node.get(root as Node, p) as AutomergeNode
            continue
        }

        if (p.length === 0) break

        // go right
        const nextPath = Path.next(p)
        if (Node.has(root as Node, nextPath)) {
            p = nextPath
            n = Node.get(root as Node, p) as AutomergeNode
            continue
        }

        // go up
        p = Path.parent(p)
        n = Node.get(root as Node, p) as AutomergeNode
    }
}

// Implementation of Node.texts that works with Automerge doc
const texts = function* (root: AutomergeNode, from?: Path) {
    const gen = nodes(root, from)
    for (const node of gen) {
        if ("text" in node) yield node.text
    }
}

const getDocumentListItemData = (
    item: Item<Document>
): DocumentListItemData => {
    const { content, categories } = item.local!

    let title = ""
    let subtitle = ""

    try {
        if (content.children.length > 0) {
            const gen = texts(content.children[0])
            for (const text of gen) {
                title += text
                if (title.length >= 75) break
            }
        }

        if (content.children.length > 1) {
            const gen = texts(content, [1])
            for (const text of gen) {
                subtitle += text + " "
                if (subtitle.length >= 75) break
            }
        }
    } catch (_) {
        // just in case
    }

    return { id: item.id, item, title, subtitle, categories }
}

const getUpdatedAt = <T>(item: Item<T>) =>
    item.state === ItemState.Synchronized
        ? item.updatedAt!
        : item.localUpdatedAt!

const makeInitialDocument = (): Document => ({
    content: toAutomerge({
        children: [
            {
                // @ts-expect-error valid TitleElement
                type: "title",
                children: [{ text: "" }]
            }
        ]
    }),
    categories: []
})

const isMeta = (item: Document | Metadata): item is Metadata => {
    return "meta" in item && item.meta == true
}

class SpaceStore {
    space: Space
    store: UserStore
    collection: Collection<Document | Metadata>
    loadedState: IPromiseBasedObservable<void>
    categoryId: string | null = null
    documentList: TransformedMap<
        Item<Document | Metadata>,
        DocumentListItemData
    >
    api: Api

    constructor(space: Space, store: UserStore) {
        this.api = store.api
        this.space = space
        this.store = store

        const col = `spaces/${space.id}`
        const collectionStore = new IndexedDbCollectionStore<
            Document | Metadata
        >(col)
        const token = this.api.getToken()
        const transport = new WebSocketTransport({
            url: `${env.wsUrl}/sinkron/${token}`
        })
        this.collection = new Collection<Document | Metadata>({
            transport,
            col,
            store: collectionStore,
            errorHandler: () => {
                this.store.logout()
            }
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
            // @ts-expect-error "this.collection.items" is ObservableMap
            source: this.collection.items,
            filter: (item) => {
                if (item.local === null) return false
                if (isMeta(item.local)) return false
                if (this.categoryId !== null) {
                    // @ts-expect-error item is not meta
                    return item.local.categories.includes(this.categoryId)
                } else {
                    return true
                }
            },
            transform: getDocumentListItemData
        })

        makeObservable(this, {
            documents: computed,
            sortedDocumentList: computed,
            metaItem: computed,
            meta: computed,
            categoryId: observable,
            category: computed,
            categoryTree: computed
        })
    }

    dispose() {
        this.collection.destroy()
    }

    get documents() {
        const documents = Array.from(this.collection.items.values()).filter(
            (item) => item.local !== null && !isMeta(item.local)
        )
        return documents as Item<Document>[]
    }

    get sortedDocumentList() {
        return Array.from(this.documentList.map.values()).sort((a, b) =>
            compareDesc(getUpdatedAt(a.item), getUpdatedAt(b.item))
        )
    }

    get metaItem() {
        for (const item of this.collection.items.values()) {
            if (item.local && isMeta(item.local)) return item
        }
        return undefined
    }

    get meta() {
        if (!this.metaItem || this.metaItem.local === null) {
            throw new Error("Metadata document not found!")
        }
        return this.metaItem.local as any as Metadata
    }

    changeMeta(cb: (m: Metadata) => void) {
        if (!this.metaItem || this.metaItem.local === null) {
            throw new Error("Metadata document not found!")
        }
        this.collection.change(this.metaItem.id, (doc) => {
            cb(doc as Metadata)
        })
    }

    changeDoc(id: string, cb: (doc: Document) => void) {
        this.collection.change(id, (doc) => {
            if (!isMeta(doc)) cb(doc)
        })
    }

    createDocument() {
        const doc = makeInitialDocument()
        if (this.categoryId !== null) {
            doc.categories.push(this.categoryId)
        }
        const id = this.collection.create(doc)
        return id
    }

    importDocument(content: Node) {
        const doc = {
            content: toAutomerge(content),
            categories: []
        }
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
            const doc = item.local as Document
            for (const i in doc.categories) {
                map[doc.categories[i]].count++
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

    get category() {
        return this.categoryId === null
            ? null
            : this.categoryTree.map[this.categoryId]
    }

    selectCategory(id: string | null) {
        this.categoryId = id
    }

    createCategory(values: { name: string; parent: string | null }) {
        const id = uuidv4()
        this.changeMeta((meta) => {
            meta.categories[id] = { id, ...values }
        })
        return id
    }

    updateCategory(id: string, data: { name: string; parent: string | null }) {
        this.changeMeta((meta) => {
            const cat = meta.categories[id]
            if (cat === undefined) return
            cat.name = data.name
            cat.parent = data.parent
        })
    }

    deleteCategory(id: string) {
        this.changeMeta((meta) => {
            // TODO if deleted category has subcategories, change their parents
            delete meta.categories[id]
        })

        this.collection.items.forEach((item) => {
            if (item.local === null) return
            const data = item.local
            if (!isMeta(data)) return
            // @ts-expect-error item is not meta
            if (data.categories.includes(id)) {
                this.collection.change(item.id, (d) => {
                    // @ts-expect-error item is not meta
                    d.categories = without(d.categories, id)
                })
            }
        })

        if (this.categoryId === id) this.categoryId = null
    }

    // === Members and invites

    fetchMembers() {
        return fromPromise(
            this.api.fetch({
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
        const state = this.api.fetch({
            method: "POST",
            url: `/spaces/${this.space.id}/upload/${id}`,
            data: content
        })
        state.then(
            () => {
                this.uploadQueue.delete(id)
            },
            () => {
                // toast
            }
        )
        const uploadState = { id, content, state: fromPromise(state) }
        this.uploadQueue.set(id, uploadState)
        return uploadState
    }
}

export default SpaceStore
