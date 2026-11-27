import assert from "node:assert"

import { LoroDoc } from "loro-crdt"
import { autorun } from "mobx"
import { v4 as uuidv4 } from "uuid"

import { CollectionStatus, ItemState } from "../collection"
import { FileApi } from "../fileApi"
import { type FileSource, BlobFileSource } from "../fileSource"
import { SinkronClient } from "../index"
import { UploadQueue } from "../uploadQueue"
import { Deferred } from "../utils/deferred"

const wsUrl = "ws://localhost:3000/sync"
const apiUrl = "http://localhost:3000"
const apiToken = "SINKRON_API_TOKEN"
const authToken = "token-test"

class BrokenSource implements FileSource {
    async getChunk(_chunk: number): Promise<Blob | null> {
        return null
    }
}

const createRandomBinaryBlob = (size: number) => {
    const array = new Uint8Array(size)
    for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
    }
    return new Blob([array])
}

const createRandomFileSource = (size: number) => {
    const data = createRandomBinaryBlob(size)
    const file = new File([data], "file.png", { type: "image/png" })
    return new BlobFileSource(file)
}

const createTestCollection = async (col: string): Promise<object> => {
    const res = await fetch(`${apiUrl}/api/create_collection`, {
        method: "POST",
        headers: {
            "x-sinkron-api-token": apiToken,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            id: col,
            isRef: false,
            permissions: JSON.stringify({
                read: [{ kind: "any" }],
                create: [{ kind: "any" }],
                update: [{ kind: "any" }],
                delete: [{ kind: "any" }],
            }),
            storageLimit: 100 * 1024 * 1024, // 100Mb
        }),
    })
    assert(res.ok)
    return await res.json()
}

const awaitValue = async (fn: () => boolean): Promise<void> =>
    new Promise((resolve) => {
        if (fn()) {
            resolve()
            return
        }
        const dispose = autorun(() => {
            if (fn()) {
                dispose()
                resolve()
            }
        })
    })

describe("FileApi", () => {
    it("request error", async () => {
        const api = new FileApi({
            url: "http://invalid",
            authToken,
        })
        const res = await api.initFileUpload({
            colId: uuidv4(),
            fileId: uuidv4(),
            size: 1024,
        })
        assert(!res.isOk)
        assert.strictEqual(res.error.kind, "request_error")
    })

    it("auth_failed error", async () => {
        const api = new FileApi({
            url: apiUrl,
            authToken: "INVALID",
        })
        const res = await api.initFileUpload({
            colId: uuidv4(),
            fileId: uuidv4(),
            size: 1024,
        })
        assert(!res.isOk)
        assert.strictEqual(res.error.kind, "server_error")
        assert.strictEqual(res.error.error.code, "auth_failed")
    })

    it("successful upload", async () => {
        // Create collection using API
        const colId = uuidv4()
        await createTestCollection(colId)

        const api = new FileApi({ url: apiUrl, authToken })

        const fileId = uuidv4()
        const size = 2 * 1024 * 1024 // 2Mb
        const data = createRandomBinaryBlob(size)

        // Init file upload
        const initRes = await api.initFileUpload({
            colId,
            fileId,
            size,
        })
        assert(initRes.isOk)

        // Upload chunk
        const uploadChunkRes = await api.uploadFileChunk({
            colId,
            fileId,
            chunkNumber: 1,
            data,
        })
        assert(uploadChunkRes.isOk)
    })
})

describe("UploadQueue", () => {
    it("successful upload", async () => {
        // Create test collection
        const colId = uuidv4()
        await createTestCollection(colId)

        // Create FileApi and UploadQueue
        const fileApi = new FileApi({ url: apiUrl, authToken })
        const queue = new UploadQueue(fileApi)
        assert(!queue.isRunning)

        // Create file that has 2 chunks
        const size = 6 * 1024 * 1024
        const source = createRandomFileSource(size)

        const isCompleted = new Deferred()
        const fileId = uuidv4()
        queue.add({
            id: fileId,
            colId,
            size,
            source,
            onComplete: () => isCompleted.resolve(undefined),
        })

        assert.strictEqual(queue.getStatus(fileId)?.kind, "in_progress")
        assert(queue.isRunning)

        await isCompleted.promise

        assert.strictEqual(queue.getStatus(fileId)?.kind, "completed")
        // TODO check uploaded file
    })

    it("chunk_read_error", async () => {
        // Create test collection
        const colId = uuidv4()
        await createTestCollection(colId)

        // Create FileApi and UploadQueue
        const fileApi = new FileApi({ url: apiUrl, authToken })
        const queue = new UploadQueue(fileApi)

        // Create broken file source
        const source = new BrokenSource()

        const isCompleted = new Deferred()
        const fileId = uuidv4()
        queue.add({
            id: fileId,
            colId,
            size: 1 * 1024 * 1024, // 1 Mb
            source,
            onComplete: () => isCompleted.resolve(undefined),
        })

        await isCompleted.promise

        const status = queue.items.get(fileId)?.status
        assert.strictEqual(status?.kind, "failed")
        assert.strictEqual(status?.error.code, "chunk_read_error")
    })

    it("insufficient_storage error", async () => {
        // Create test collection
        const colId = uuidv4()
        await createTestCollection(colId)

        // Create FileApi and UploadQueue
        const fileApi = new FileApi({ url: apiUrl, authToken })
        const queue = new UploadQueue(fileApi)

        // Create file
        const source = createRandomFileSource(1024)

        const isCompleted = new Deferred()
        const fileId = uuidv4()
        queue.add({
            id: fileId,
            colId,
            size: 101 * 1024 * 1024, // 101 Mb
            source,
            onComplete: () => isCompleted.resolve(undefined),
        })

        await isCompleted.promise

        const status = queue.items.get(fileId)?.status
        assert.strictEqual(status?.kind, "failed")
        assert.strictEqual(status?.error.code, "insufficient_storage")
    })
})

describe("SinkronCollection", () => {
    it("create, update and delete", async () => {
        // Create test collection
        const colId = uuidv4()
        await createTestCollection(colId)

        const client = new SinkronClient({
            wsUrl,
            apiUrl,
            authToken,
            noAutoReconnect: true,
        })
        const collection = client.collection({ col: colId })

        await awaitValue(
            () => collection.status === CollectionStatus.SyncCompleted,
        )

        // Create document
        const doc = new LoroDoc()
        doc.getText("text").insert(0, "Hello")
        const id = collection.create(doc)

        // Should flush immediately
        assert.strictEqual(
            collection.items.get(id)?.state,
            ItemState.ChangesSent,
        )

        // Await creation
        await awaitValue(
            () => collection.items.get(id)?.state === ItemState.Synchronized,
        )

        // Update document
        collection.change(id, (doc) => {
            doc.getText("text").insert(5, ", world!")
        })
        collection.flushImmediate()

        // Changes should be sent
        assert.strictEqual(
            collection.items.get(id)?.state,
            ItemState.ChangesSent,
        )

        // Await updated
        await awaitValue(
            () => collection.items.get(id)?.state === ItemState.Synchronized,
        )

        // Delete document
        collection.delete(id)

        // Changes should be sent
        const item = collection.items.get(id)
        assert.strictEqual(item?.local, null)
        assert(item?.remote !== null)
        assert.strictEqual(item?.state, ItemState.ChangesSent)

        // Await deleted
        await awaitValue(() => collection.items.get(id) === undefined)

        client.destroy()
        assert(client.isDestroyed)
    })

    it.only("files", async () => {
        // Create test collection
        const colId = uuidv4()
        await createTestCollection(colId)

        // Create client & sync collection
        const client = new SinkronClient({
            wsUrl,
            apiUrl,
            authToken,
            noAutoReconnect: true,
        })
        const collection = client.collection({ col: colId })
        await awaitValue(
            () => collection.status === CollectionStatus.SyncCompleted,
        )

        // Create document with a file
        const doc = new LoroDoc()
        doc.getText("text").insert(0, "Hello")
        const size = 6 * 1024 * 1024
        const file = {
            size,
            contentType: "image/png",
            source: createRandomFileSource(size),
        }
        const id = collection.create(doc, { files: [file] })

        // Should not flush immediately, until files are uploaded
        assert.strictEqual(collection.items.get(id)?.state, ItemState.Changed)

        // Await sending after files uploaded
        await awaitValue(
            () => collection.items.get(id)?.state === ItemState.ChangesSent,
        )

        // Await creation
        await awaitValue(
            () => collection.items.get(id)?.state === ItemState.Synchronized,
        )

        const item = collection.items.get(id)
        assert(item !== undefined)
        const itemFile = item.local?.files.values().next().value
        assert(itemFile !== undefined)
        assert(itemFile.isCreated)

        collection.deleteFile(id, itemFile.props.id)

        await awaitValue(() => item.state === ItemState.ChangesSent)
        await awaitValue(() => item.state === ItemState.Synchronized)

        assert.strictEqual(item.remote?.files.size, 0)

        client.destroy()
    })
})

// 6. create file
//
// 7. await created
//
// 8. delete file
//
// 9. await deleted
