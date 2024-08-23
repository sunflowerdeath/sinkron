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
import { toAutomerge } from "../slate"
import { Api } from "../api"
import { TransformedMap } from "../utils/transformedMap"
import listToTree from "../utils/listToTree"
import type { Tree } from "../utils/listToTree"

import UserStore from "./UserStore"

export interface DocumentListItemData {
    id: string
    item: Item<Document>
    title: string
    subtitle: string | null
}

// Implementation of Node.nodes that works with Automerge doc 
const nodes = function* (root: Node, from?: Path) {
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
            n = Node.get(root, p)
            continue
        }

        if (p.length === 0) break

        // go right
        const nextPath = Path.next(p)
        if (Node.has(root, nextPath)) {
            p = nextPath
            n = Node.get(root, p)
            continue
        }

        // go up
        p = Path.parent(p)
        n = Node.get(root, p)
    }
}

// Implementation of Node.texts that works with Automerge doc 
const texts = function*(root: Node, from?: Path) {
    const gen = nodes(root, from)
    for (const node of gen) {
        if ("text" in node) yield node.text
    }
}

const getDocumentListItemData = (
    item: Item<Document>
): DocumentListItemData => {
    const doc = item.local!.content

    let title = ""
    let subtitle = ""

    try {
        if (doc.children.length > 0) {
            const gen = texts(doc.children[0])
            for (const text of gen) {
                title += text
                if (title.length >= 75) break
            }
        }

        if (doc.children.length > 1) {
            const gen = texts(doc, [1])
            for (const text of gen) {
                subtitle += text + " "
                if (subtitle.length >= 75) break
            }
        }
    } catch (_) {
        // just in case
    }

    return { id: item.id, item, title, subtitle }
}

const getUpdatedAt = <T>(item: Item<T>) =>
    item.state === ItemState.Synchronized
        ? item.updatedAt!
        : item.localUpdatedAt!

const makeInitialDocument = () => ({
    content: toAutomerge({
        children: [
            {
                type: "title",
                children: [{ text: "" }]
            }
        ]
    }),
    categories: []
})

class SpaceStore {
    space: Space
    store: UserStore
    collection: Collection<Document>
    loadedState: IPromiseBasedObservable<void>
    categoryId: string | null = null
    documentList: TransformedMap<Item<Document>, DocumentListItemData>
    api: Api

    constructor(space: Space, store: UserStore) {
        this.api = store.api
        this.space = space
        this.store = store

        const col = `spaces/${space.id}`
        const collectionStore = new IndexedDbCollectionStore<Document>(col)
        const token = this.api.getToken()
        const transport = new WebSocketTransport({
            url: `${env.wsUrl}/sinkron/${token}`
        })
        this.collection = new Collection<Document>({
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
            source: this.collection.items,
            filter: (item) => {
                if (item.local === null) return false
                if (item.local.meta) return false
                if (this.categoryId !== null) {
                    return item.local.categories.includes(this.categoryId)
                } else {
                    return true
                }
            },
            transform: getDocumentListItemData
        })

        makeObservable(this, {
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

    get sortedDocumentList() {
        return Array.from(this.documentList.map.values()).sort((a, b) =>
            compareDesc(getUpdatedAt(a.item), getUpdatedAt(b.item))
        )
    }

    get metaItem() {
        for (const [key, item] of this.collection.items.entries()) {
            if (item.local?.meta === true) return item
        }
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
        this.collection.change(this.metaItem.id, cb)
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

    get categoryTree(): Tree<Category> {
        return listToTree(Object.values(this.meta.categories))
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
            delete meta.categories[id]
        })

        this.collection.items.forEach((item) => {
            if (item.local === null) return
            const data = item.local
            if (data.meta) return
            if (data.categories.includes(id)) {
                this.collection.change(item.id, (d) => {
                    d.categories = without(d.categories, id)
                })
            }
        })

        if (this.categoryId === id) this.categoryId = null
    }

    fetchMembers() {
        return fromPromise(
            this.api.fetch({
                method: "GET",
                url: `/spaces/${this.space.id}/members`
            })
        )
    }

    sendInvite(toName: string, role: string) {
        return fromPromise(
            this.api.fetch({
                method: "POST",
                url: "/invites/new",
                data: { spaceId: this.space.id, toName, role }
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

    renameSpace(name: string) {
        return fromPromise(
            this.api.fetch({
                method: "POST",
                url: `/spaces/${this.space.id}/rename`,
                data: { name }
            })
        )
    }
}

export default SpaceStore
