import { reaction, makeObservable, computed, observable } from "mobx"
import { fromPromise, IPromiseBasedObservable } from "mobx-utils"
import Cookies from "js-cookie"
import { v4 as uuidv4 } from "uuid"
import { without } from "lodash-es"
import {
    Collection,
    Item,
    WebsocketTransport,
    IndexedDbCollectionStore,
    ItemState
} from "sinkron-client"
import { compareDesc } from "date-fns"

import env from "../env"
import { Space, Document, Category, Metadata } from "../entities"
import { toAutomerge } from "../slate"
import { fetchApi } from "../fetchJson2"
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

const getDocumentListItemData = (
    item: Item<Document>
): DocumentListItemData => {
    const doc = item.local!.content
    const firstNode = doc.children[0]
    const firstNodeText = firstNode
        ? firstNode.children.map((c) => c.text).join("")
        : ""
    const title = firstNodeText.length > 0 ? firstNodeText : null
    // let subtitle
    // if (title !== null && title.length > 0) {
    const secondNode = doc.children[1]
    const secondNodeText = secondNode
        ? secondNode.children.map((c) => c.text).join("")
        : ""
    const subtitle = secondNodeText.slice(0, 100)
    // }
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

    constructor(space: Space, store: UserStore) {
        this.space = space
        this.store = store

        const col = `spaces/${space.id}`
        const collectionStore = new IndexedDbCollectionStore<Document>(col)
        const token = Cookies.get("token")
        const transport = new WebsocketTransport(
            `${env.wsUrl}/sinkron/${token}`
        )
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
            categoryMap: computed,
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

    get category() {
        return this.categoryId === null
            ? null
            : this.meta.categories[this.categoryId]
    }

    createDocument() {
        const doc = makeInitialDocument()
        if (this.categoryId !== null) {
            doc.categories.push(this.categoryId)
        }
        const id = this.collection.create(doc)
        return id
    }

    get categoryMap() {
        return this.meta.categories
    }

    get categoryTree(): Tree<Category> {
        return listToTree(Object.values(this.categoryMap))
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
            fetchApi({
                method: "GET",
                url: `${env.apiUrl}/spaces/${this.space.id}/members`
            })
        )
    }

    sendInvite(toName: string, role: string) {
        return fromPromise(
            fetchApi({
                method: "POST",
                url: `${env.apiUrl}/invites/new`,
                data: { spaceId: this.space.id, toName, role }
            })
        )
    }

    removeMember(memberId: string) {
        return fromPromise(
            fetchApi({
                method: "POST",
                url: `${env.apiUrl}/spaces/${this.space.id}/members/${memberId}/remove`
            })
        )
    }
}

export default SpaceStore
