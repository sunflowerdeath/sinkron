import { createContext, useContext } from 'react'
import {
    makeAutoObservable,
    reaction,
    observe,
    makeObservable,
    computed,
    observable
} from 'mobx'
import { fromPromise } from 'mobx-utils'
import Cookies from 'js-cookie'
import { v4 as uuidv4 } from 'uuid'
import { without } from 'lodash-es'

import { AutomergeNode, toAutomerge } from '../slate'

import {
    Collection,
    Item,
    ItemState,
    WebsocketTransport,
    IndexedDbCollectionStore
} from '../sinkron/client'
import { ConnectionStatus } from '../sinkron/client'

import { TransformedMap } from './transformedMap'
import { fetchJson, FetchError } from './fetchJson'
import { compareAsc, compareDesc } from 'date-fns'

export interface Space {
    id: string
    name: string
    owner: User
    membersCount: number
    role: SpaceRole
}

export type SpaceRole = 'readonly' | 'editor' | 'admin'

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
    categories: Category[]
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
        ? firstNode.children.map((c) => c.text).join('')
        : ''
    const title = firstNodeText.length > 0 ? firstNodeText : null
    // let subtitle
    // if (title !== null && title.length > 0) {
    const secondNode = doc.children[1]
    const secondNodeText = secondNode
        ? secondNode.children.map((c) => c.text).join('')
        : ''
    const subtitle = secondNodeText.slice(0, 100)
    // }
    return { id: item.id, item, title, subtitle }
}

class Store {
    isInited: boolean = false
    user?: User
    currentSpace?: string

    constructor() {
        this.init()
        makeAutoObservable(this)
    }

    get space() {
        return this.user!.spaces.find((s) => s.id === this.currentSpace)!
    }

    get spaceStore() {
        if (this.space === undefined) return
        const space = this.user!.spaces.find((s) => s.id === this.currentSpace)
        return new SpaceStore(space!)
    }

    async init() {
        const user = localStorage.getItem('user')
        if (user !== null) {
            this.setUser(JSON.parse(user))
            await this.fetchProfile()
        }
        this.isInited = true
    }

    setUser(user: User) {
        this.user = user
        this.currentSpace = this.user.spaces?.[0].id
        localStorage.setItem('user', JSON.stringify(this.user))
    }

    async fetchProfile() {
        console.log('Fetching user...')
        const res = await fetchJson<User>({ url: '/api/profile' })
        if (res.isOk) {
            this.setUser(res.value)
            console.log('Fetch user success')
        } else {
            if (res.error.kind === 'http') {
                // TODO if session expired / terminated
                console.log('Fetch user error')
                this.logout()
            }
        }
    }

    async authenticate(credentials: Credentials) {
        const res = await fetchJson<User>({
            method: 'POST',
            url: '/api/login',
            data: credentials
        })
        if (res.isOk) {
            this.setUser(res.value)
            console.log('Logged in')
        } else {
            return res.error
        }
    }

    logout() {
        console.log('Logout')
        this.user = undefined
        this.currentSpace = undefined
        localStorage.removeItem('user')
        history.pushState({}, '', '/')
    }

    async createSpace(name: string) {
        const state = fromPromise(
            fetchJson({
                method: 'POST',
                url: '/api/spaces/new',
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
                type: 'title',
                children: [{ text: '' }]
            }
        ]
    }),
    categories: []
})

const getUpdatedAt = <T>(item: Item<T>) =>
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

class SpaceStore {
    space: Space
    collection: Collection<Document>

    currentCategoryId: string | null = null
    list: TransformedMap<Item<Document>, DocumentListItemData>

    constructor(space: Space) {
        this.space = space

        const col = `spaces/${space.id}`
        const store = new IndexedDbCollectionStore(col)
        const token = Cookies.get('token')
        const transport = new WebsocketTransport(`ws://127.0.0.1:8080/${token}`)
        this.collection = new Collection<Document>({
            transport,
            col,
            store
        })

        // @ts-ignore
        window.col = this.collection

        this.list = new TransformedMap({
            source: this.collection.items,
            filter: (item) => {
                if (item.local === null) return false
                if (item.local.meta) return false

                if (this.currentCategoryId !== null) {
                    return item.local.categories.includes(
                        this.currentCategoryId
                    )
                } else {
                    return true
                }
            },
            transform: getDocumentListItemData
        })

        makeObservable(this, {
            metaItem: computed,
            meta: computed,
            currentCategoryId: observable,
            currentCategory: computed,
            categories: computed
        })
    }

    get metaItem() {
        for (let [key, item] of this.collection.items.entries()) {
            if (item.local?.meta === true) return item
        }
    }

    get meta() {
        if (!this.metaItem || this.metaItem.local === null) {
            throw new Error('Metadata document not found!')
        }
        return this.metaItem.local as any as Metadata
    }

    changeMeta(cb: (m: Metadata) => void) {
        if (!this.metaItem || this.metaItem.local === null) {
            throw new Error('Metadata document not found!')
        }
        this.collection.change(this.metaItem.id, cb)
    }

    get currentCategory() {
        return this.currentCategoryId === null
            ? null
            : this.meta.categories.find((c) => c.id === this.currentCategoryId)
    }

    get sortedList() {
        return Array.from(this.list.map.values()).sort((a, b) =>
            compareDesc(getUpdatedAt(a.item), getUpdatedAt(b.item))
        )
    }

    createDocument() {
        const doc = makeInitialDocument()
        if (this.currentCategoryId !== null) {
            doc.categories.push(this.currentCategoryId)
        }
        const id = this.collection.create(doc)
        return id
    }

    get categories() {
        return listToTree(this.meta.categories)
    }

    selectCategory(id: string | null) {
        this.currentCategoryId = id
    }

    createCategory(name: string, parent: string | null = null) {
        const id = uuidv4()
        this.changeMeta((meta) => {
            meta.categories.push({ id, name, parent })
        })
        return id
    }

    updateCategory(id: string, data: { name: string; parent: string | null }) {
        this.changeMeta((meta) => {
            const cat = meta.categories.find((c) => c.id === id)
            if (cat === undefined) return
            cat.name = name
            cat.parent = parent
        })
    }

    deleteCategory(id: string) {
        this.changeMeta((meta) => {
            const idx = meta.categories.findIndex((c) => c.id === id)
            if (idx !== -1) meta.categories.deleteAt(idx)
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

        if (this.currentCategoryId === id) this.currentCategoryId = null
    }
}

const StoreContext = createContext<Store>(null)

const useStore = () => useContext(StoreContext)

export { Store, useStore, StoreContext }
