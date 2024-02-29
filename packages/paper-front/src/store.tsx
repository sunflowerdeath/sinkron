import { createContext, useContext } from "react"
import {
    makeAutoObservable,
    reaction,
    observe,
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
    IndexedDbCollectionStore,
    ConnectionStatus
} from "sinkron-client"
import { compareAsc, compareDesc } from "date-fns"

import { AutomergeNode, toAutomerge } from "./slate"

import { TransformedMap } from "./transformedMap"
import { fetchJson, FetchError } from "./fetchJson"

import { fetchApi } from "./fetchJson2"

export interface Space {
    id: string
    name: string
    owner: User
    membersCount: number
    role: SpaceRole
}

export type SpaceRole = "readonly" | "editor" | "admin"

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
    isInited?: boolean = false
    user?: User = undefined
    store?: Store = undefined

    constructor() {
        this.init()
        makeAutoObservable(this)
    }

    async init() {
        const user = localStorage.getItem("user")
        if (user !== null) {
            this.setUser(JSON.parse(user))
            this.isInited = true
            await this.fetchProfile()
        } else {
            this.isInited = true
        }
    }

    setUser(user: User) {
        this.user = user
        localStorage.setItem("user", JSON.stringify(this.user))
        this.store = new Store(this, user, undefined)
    }

    async fetchProfile() {
        console.log("Fetching user...")
        const res = await fetchJson<User>({ url: "/api/profile" })
        if (res.isOk) {
            this.setUser(res.value)
            console.log("Fetch user success")
        } else {
            if (res.error.kind === "http") {
                // TODO if session expired / terminated
                console.log("Fetch user error")
                this.logout()
            }
        }
    }

    async authenticate(credentials: Credentials) {
        let profile
        try {
            profile = await fetchApi<User>({
                method: "POST",
                url: "/api/login",
                data: credentials
            })
        } catch (e) {
            throw e
        }
        this.setUser(profile)
        console.log("Logged in")
    }

    async signup(credentials: Credentials) {
        let profile
        try {
            profile = await fetchApi<User>({
                method: "POST",
                url: "/api/signup",
                data: credentials
            })
        } catch (e) {
            throw e
        }
        this.setUser(profile)
        console.log("Signed up")
    }

    logout() {
        console.log("Logout")
        this.user = undefined
        localStorage.removeItem("user")
        history.pushState({}, "", "/")
    }
}

class Store {
    authStore: AuthStore
    user: User
    spaceId: string
    space!: SpaceStore

    constructor(authStore: AuthStore, user: User, spaceId: string | undefined) {
        this.authStore = authStore
        this.user = user
        this.spaceId = spaceId || user.spaces[0].id
        makeAutoObservable(this)

        reaction(
            () => this.spaceId,
            () => {
                const space = this.user.spaces.find(
                    (s) => s.id === this.spaceId
                )!
                this.space = new SpaceStore(space)
            },
            { fireImmediately: true }
        )
    }

    logout() {
        this.authStore.logout()
    }

    async createSpace(name: string) {
        const state = fromPromise(
            fetchJson({
                method: "POST",
                url: "/api/spaces/new",
                data: { name }
            })
        )
        return state
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

const getUpdatedAt = <T,>(item: Item<T>) =>
    item.state === ItemState.Synchronized
        ? item.updatedAt!
        : item.localUpdatedAt!

type ListItem = { id: string; parent: string | null }

export type TreeNode<T extends {}> = T & { children: TreeNode<T>[] }

const listToTree = <T extends ListItem>(list: T[]): TreeNode<T>[] => {
    const index: { [id: string]: TreeNode<T> } = {}
    list.forEach((c) => {
        index[c.id] = { ...c, children: [] }
    })
    const tree: TreeNode<T>[] = []
    list.forEach((item) => {
        const node = index[item.id]
        if (item.parent) {
            const parentNode = index[item.parent]
            parentNode.children.push(node)
        } else {
            tree.push(node)
        }
    })
    return tree
}

const isProductionEnv = window.location.hostname.includes("onrender.com")

const BACKEND_URL = isProductionEnv
    ? "wss://sinkron.onrender.com"
    : "ws://127.0.0.1:80"

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
        console.log(BACKEND_URL)
        const transport = new WebsocketTransport(`${BACKEND_URL}/${token}`)
        this.collection = new Collection<Document>({
            transport,
            col,
            store
        })
        // @ts-ignore
        window.col = this.collection

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
            categoriesTree: computed
        })
    }

    get sortedDocumentList() {
        return Array.from(this.documentList.map.values()).sort((a, b) =>
            compareDesc(getUpdatedAt(a.item), getUpdatedAt(b.item))
        )
    }

    get metaItem() {
        for (let [key, item] of this.collection.items.entries()) {
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

    get categoriesMap() {
        return this.meta.categories
    }
    get categoriesTree() {
        return listToTree(Object.values(this.categoriesMap))
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
}

const StoreContext = createContext<Store>(null)

const useStore = () => useContext(StoreContext)

export { AuthStore, Store, useStore, StoreContext }
