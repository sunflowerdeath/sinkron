import { createContext, useContext } from "react"
import {
    makeAutoObservable,
    reaction,
    makeObservable,
    computed,
    observable
} from "mobx"
import { fromPromise } from "mobx-utils"
import Cookies from "js-cookie"
import { v4 as uuidv4 } from "uuid"
import { without } from "lodash-es"
import {
    Collection,
    Item,
    ItemState,
    WebsocketTransport,
    IndexedDbCollectionStore
    // ConnectionStatus
} from "sinkron-client"
import { compareDesc } from "date-fns"

import { AutomergeNode, toAutomerge } from "./slate"
import { TransformedMap } from "./utils/transformedMap"
import { fetchJson } from "./fetchJson"
import { fetchApi } from "./fetchJson2"
import env from "./env"
import listToTree from "./utils/listToTree"
import type { Tree, TreeNode } from "./utils/listToTree"

export type { Tree, TreeNode }

export interface Space {
    id: string
    name: string
    owner: User
    membersCount: number
    role: SpaceRole
}

export type SpaceRole = "readonly" | "editor" | "admin" | "owner"

export interface User {
    id: string
    name: string
    spaces: Space[]
}

export type Credentials = { name: string; password: string }

export type Category = {
    id: string
    name: string
    parent: string | null
}

export type Metadata = {
    meta: true
    categories: { [key: string]: Category }
}

export interface Document {
    content: AutomergeNode
    categories: string[]
}

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

class AuthStore {
    store?: Store = undefined

    constructor() {
        const user = localStorage.getItem("user")
        if (user !== null) {
            this.store = new Store({
                user: JSON.parse(user),
                authStore: this
            })
            this.store.fetchUser()
        }
        makeAutoObservable(this)
    }

    async login(credentials: Credentials) {
        const user = await fetchApi<User>({
            method: "POST",
            url: `${env.apiUrl}/login`,
            data: credentials
        })
        localStorage.setItem("user", JSON.stringify(user))
        this.store = new Store({ user, authStore: this })
        console.log(`Logged in as "${user.name}"`)
    }

    async signup(credentials: Credentials) {
        const user = await fetchApi<User>({
            method: "POST",
            url: `${env.apiUrl}/signup`,
            data: credentials
        })
        localStorage.setItem("user", JSON.stringify(user))
        this.store = new Store({ user, authStore: this })
        console.log(`Signed up as ${user.name}`)
    }

    logout() {
        console.log("Logout")
        localStorage.removeItem("user")
        this.store = undefined
        history.pushState({}, "", "/")
    }
}

interface StoreProps {
    user: User
    spaceId?: string
    authStore: AuthStore
}

class Store {
    authStore: AuthStore
    user: User
    spaceId?: string = undefined
    space?: SpaceStore = undefined

    constructor(props: StoreProps) {
        const { user, authStore, spaceId } = props
        this.authStore = authStore
        this.user = user
        this.spaceId = spaceId || user.spaces[0]?.id

        makeAutoObservable(this)

        reaction(
            () => this.spaceId,
            () => {
                this.space?.dispose()
                const space = this.user.spaces.find(
                    (s) => s.id === this.spaceId
                )!
                this.space = new SpaceStore(space)
            },
            { fireImmediately: true }
        )
    }

    dispose() {
        this.space?.dispose()
    }

    async fetchUser() {
        console.log("Fetching user...")
        const res = await fetchJson<User>({ url: `${env.apiUrl}/profile` })
        if (res.isOk) {
            this.updateUser(res.value)
            console.log("Fetch user success")
        } else {
            if (res.error.kind === "http") {
                // TODO if session expired / terminated
                console.log("Fetch user error")
                this.logout()
            }
        }
    }

    updateUser(user: User) {
        this.user = user
        if (!user.spaces.find((s) => s.id === this.spaceId)) {
            this.spaceId = user.spaces[0].id
        }
    }

    logout() {
        this.authStore.logout()
    }

    async createSpace(name: string) {
        const state = fromPromise(
            fetchJson({
                method: "POST",
                url: `${env.apiUrl}/spaces/new`,
                data: { name }
            })
        )
        return state
    }

    changeSpace(spaceId: string) {
        if (this.spaceId !== spaceId) {
            this.spaceId = spaceId
        }
    }
}

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

const getUpdatedAt = <T>(item: Item<T>) =>
    item.state === ItemState.Synchronized
        ? item.updatedAt!
        : item.localUpdatedAt!

class SpaceStore {
    space: Space
    collection: Collection<Document>
    categoryId: string | null = null
    documentList: TransformedMap<Item<Document>, DocumentListItemData>

    constructor(space: Space) {
        this.space = space

        const col = `spaces/${space.id}`
        const store = new IndexedDbCollectionStore(col)
        const token = Cookies.get("token")
        console.log("TOKEN", token)
        const transport = new WebsocketTransport(`${env.wsUrl}/${token}`)
        this.collection = new Collection<Document>({
            transport,
            col,
            store
        })

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
            fetchJson({
                method: "GET",
                url: `${env.apiUrl}/spaces/${this.space.id}/members`
            })
        )
    }
}

const StoreContext = createContext<Store | null>(null)
const useStore = () => {
    const store = useContext(StoreContext)
    if (store === null) throw new Error("Store not provided")
    return store
}

const SpaceContext = createContext<SpaceStore | null>(null)
const useSpace = () => {
    const space = useContext(SpaceContext)
    if (space === null) throw new Error("Space not provided")
    return space
}

export { AuthStore, Store, useStore, useSpace, StoreContext, SpaceContext }
