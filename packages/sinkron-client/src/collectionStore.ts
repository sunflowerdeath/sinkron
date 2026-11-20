import { Item, ItemFile } from "./index"
import { ObservableLoroDoc, loroFromBase64, loroToBase64 } from "./loroUtils"
import { FileProps } from "./protocol"
import { Deferred } from "./utils/deferred"

export interface CollectionStore {
    save(id: string, item: Item<any>): Promise<void>
    delete(id: string): Promise<void>
    colrev(colrev: number): Promise<void>
    load(): Promise<{ items: StoredItem[]; colrev: number }>
    dispose(): void
}

export type StoredFile = {
    props: FileProps
    isCreated: boolean
    localPath: string | null
}

let fileToStored = (file: ItemFile): StoredFile => {
    return {
        props: file.props,
        isCreated: file.isCreated,
        localPath: null, // TODO use source
    }
}

export type StoredItem = {
    id: string
    remote: { content: ObservableLoroDoc; files: StoredFile[] } | null
    local: { content: ObservableLoroDoc; files: StoredFile[] } | null
    createdAt?: Date
    updatedAt?: Date
    localUpdatedAt?: Date
}

interface SerializedItem {
    id: string
    local: { content: string; files: StoredFile[] } | null
    remote: { content: string; files: StoredFile[] } | null
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
            local:
                local === null
                    ? null
                    : {
                          content: loroToBase64(local.content),
                          files: Object.values(local.files).map(fileToStored),
                      },
            remote:
                remote === null
                    ? null
                    : {
                          content: loroToBase64(remote.content),
                          files: Object.values(remote.files).map(fileToStored),
                      },
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
            local:
                local === null
                    ? null
                    : {
                          content: loroFromBase64(local.content),
                          files: local.files,
                      },
            remote:
                remote === null
                    ? null
                    : {
                          content: loroFromBase64(remote.content),
                          files: remote.files,
                      },
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
