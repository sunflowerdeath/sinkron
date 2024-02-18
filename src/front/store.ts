import { createContext, useContext } from 'react'
import { makeAutoObservable, reaction, observe } from 'mobx'
import { fromPromise } from 'mobx-utils'
import Cookies from 'js-cookie'

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

interface Space {
    id: string
    name: string
    owner: User
    membersCount: number
    role: SpaceRole
}

type SpaceRole = 'readonly' | 'editor' | 'admin'

interface User {
    id: string
    name: string
    spaces: Space[]
}

type Credentials = { name: string; password: string }

class Store {
    isInited: boolean = false

    user?: User = undefined
    space?: string = undefined

    get spaceE() {
        return this.space === undefined
            ? undefined
            : this.user!.spaces.find((s) => s.id === this.space)
    }

    get spaceStore() {
        if (this.space === undefined) return
        const space = this.user!.spaces.find((s) => s.id === this.space)
        return new SpaceStore(space!)
    }

    constructor() {
        this.init()
        makeAutoObservable(this)
    }

    setUser(user: User) {
        this.user = user
        this.space = this.user.spaces?.[0].id
        localStorage.setItem('user', JSON.stringify(this.user))
    }

    async init() {
        const user = localStorage.getItem('user')
        if (user !== null) {
            this.setUser(JSON.parse(user))
            await this.fetchProfile()
        }
        this.isInited = true
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
        this.space = undefined
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

const getUpdatedAt = <T>(item: Item<T>) =>
    item.state === ItemState.Synchronized
        ? item.updatedAt!
        : item.localUpdatedAt!

class SpaceStore {
    space: Space
    collection: Collection<Document>
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
            filter: (item) => item.local !== null,
            transform: (item) => this.makeItemData(item)
        })
    }

    makeItemData(item) {
        const doc = item.local!.content
        const firstNode = doc.children[0]
        const firstNodeText = firstNode
            ? firstNode.children.map((c) => c.text).join('')
            : ''
        const title = firstNodeText.length > 0 ? firstNodeText : null
        let subtitle
        if (title !== null && title.length > 0) {
            const secondNode = doc.children[1]
            const secondNodeText = secondNode
                ? secondNode.children.map((c) => c.text).join('')
                : ''
            subtitle = secondNodeText.slice(0, 100)
        }
        return { id: item.id, item, title, subtitle }
    }

    get sortedList() {
        return Array.from(this.list.map.values()).sort((a, b) =>
            compareDesc(getUpdatedAt(a.item), getUpdatedAt(b.item))
        )
    }
}

const StoreContext = createContext<Store>(null)

const useStore = () => useContext(StoreContext)

export { Store, useStore, StoreContext }
