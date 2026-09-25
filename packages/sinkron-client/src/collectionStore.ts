import { Item } from "./index"
import { ObservableLoroDoc, loroFromBase64, loroToBase64 } from "./loroUtils"

export interface CollectionStore {
    save(id: string, item: Item<any>): Promise<void>
    delete(id: string): Promise<void>
    colrev(colrev: number): Promise<void>
    load(): Promise<{ items: StoredItem[]; colrev: number }>
    dispose(): void
}

export type StoredItem = {
    id: string
    remote: ObservableLoroDoc | null
    local: ObservableLoroDoc | null
    createdAt?: Date
    updatedAt?: Date
    localUpdatedAt?: Date
}

class Deferred<T> {
    promise: Promise<T>
    resolve!: (res: T | PromiseLike<T>) => void
    constructor() {
        this.promise = new Promise((resolve) => {
            this.resolve = resolve
        })
    }
}

interface SerializedItem {
    id: string
    local: string | null
    remote: string | null
    createdAt?: Date
    updatedAt?: Date
    localUpdatedAt?: Date
}

class IndexedDbCollectionStore implements CollectionStore {
    constructor(key: string) {
        this.key = key
        const deferred = new Deferred<void>()
        const req = indexedDB.open(key)
        req.onsuccess = () => {
            this.db = req.result
            deferred.resolve()
        }
        req.onupgradeneeded = (event) => {
            // @ts-ignore
            const db = event.target.result
            db!.createObjectStore("items") // XXX wait until success?
            localStorage.setItem(`sinkron_collection/${key}`, "0")
        }
        this.isReady = deferred.promise
    }

    key: string
    isReady: Promise<void>
    db?: IDBDatabase

    dispose() {
        this.db?.close()
    }

    async clear() {
        const store = this.db!.transaction("items", "readwrite").objectStore(
            "items",
        )
        const deferred = new Deferred<void>()
        const req = store.clear()
        req.onsuccess = () => deferred.resolve()
        await deferred.promise
        localStorage.setItem(`stored_collection/${this.key}`, "0")
    }

    async save(id: string, item: Item<any>) {
        const { local, remote, localUpdatedAt, createdAt, updatedAt } = item
        const store = this.db!.transaction("items", "readwrite").objectStore(
            "items",
        )
        const serialized: SerializedItem = {
            id,
            local: local === null ? null : loroToBase64(local),
            remote: remote === null ? null : loroToBase64(remote),
            localUpdatedAt,
            createdAt,
            updatedAt,
        }
        const deferred = new Deferred<void>()
        const req = store.put(serialized, id)
        req.onsuccess = () => deferred.resolve()
        await deferred.promise
    }

    async delete(id: string) {
        const store = this.db!.transaction("items", "readwrite").objectStore(
            "items",
        )
        const deferred = new Deferred<void>()
        const req = store.delete(id)
        req.onsuccess = () => deferred.resolve()
        await deferred.promise
    }

    async colrev(colrev: number) {
        localStorage.setItem(`stored_collection/${this.key}`, String(colrev))
    }

    deserializeItem(item: SerializedItem): StoredItem {
        const { id, local, remote, localUpdatedAt, createdAt, updatedAt } = item
        return {
            id,
            local: local === null ? null : loroFromBase64(local),
            remote: remote === null ? null : loroFromBase64(remote),
            localUpdatedAt,
            createdAt,
            updatedAt,
        }
    }

    async load() {
        const val = localStorage.getItem(`stored_collection/${this.key}`)
        const colrev = val === null ? 0 : parseInt(val)

        await this.isReady

        // retrieve items from indexed db
        const store = this.db!.transaction("items").objectStore("items")
        const req = store.getAll()
        const deferred = new Deferred<SerializedItem[]>()
        // @ts-ignore
        req.onsuccess = (event) => deferred.resolve(event.target.result)

        const result = await deferred.promise
        const items = result.map((item) => this.deserializeItem(item))
        return { colrev, items }
    }

    static async clearAll() {
        const toRemove: string[] = []
        const len = localStorage.length
        for (let i = 0; i < len; i++) {
            const key = localStorage.key(i)!
            const match = key.match(/^stored_collection\/(.+)/)
            if (match !== null) toRemove.push(match[1])
        }

        for (const id of toRemove) {
            const req = indexedDB.deleteDatabase(id)
            const deferred = new Deferred<void>()
            req.onsuccess = () => deferred.resolve()
            await deferred.promise
            localStorage.removeItem(`stored_collection/${id}`)
            console.log(`Deleted local storage for ${id}`)
        }
    }
}

export { IndexedDbCollectionStore }
