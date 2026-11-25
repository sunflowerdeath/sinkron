import assert from "node:assert"

import { v4 as uuidv4 } from "uuid"

import { FileApi } from "../fileApi"
import { type FileSource, CHUNK_SIZE, BlobFileSource } from "../fileSource"
import { UploadQueue } from "../uploadQueue"
import { Deferred } from "../utils/deferred"

const apiUrl = "http://localhost:3000"
const apiToken = "SINKRON_API_TOKEN"
const authToken = "token-test"

const createRandomBinaryBlob = (size: number) => {
    const array = new Uint8Array(size)
    for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
    }
    return new Blob([array])
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
                read: ["any"],
                create: ["any"],
                update: ["any"],
                delete: ["any"],
            }),
            storageLimit: 100 * 1024 * 1025, // 100Mb
        }),
    })
    assert(res.ok)
    return await res.json()
}

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

    it("invalid auth", async () => {
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
        assert.strictEqual(res.error.kind, "application_error")
    })

    it("valid", async () => {
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
        const data = createRandomBinaryBlob(size)
        const file = new File([data], "file.png", { type: "image/png" })
        const source = new BlobFileSource(file)

        const isCompleted = new Deferred()
        const fileId = uuidv4()
        queue.add({
            id: fileId,
            colId,
            size,
            source,
            onComplete: () => isCompleted.resolve(undefined),
        })

        assert.strictEqual(queue.items.get(fileId)?.status.kind, "in_progress")
        assert(queue.isRunning)

        await isCompleted.promise

        assert.strictEqual(queue.items.get(fileId)?.status.kind, "completed")

        // TODO check uploaded file
    })

    // TODO test errors
    //
    // upload file 100Mb
    // await onComplete
    // item should have status error : insufficient_storage
    //
    // upload file with broken source
    // await onComplete
    // item should have error: chunk read error
})

/*
describe("SinkronCollection", () => {
    it("create", async () => {
        // 1. create collection
        //
        // 1. test errors - collection not found / auth error
        //
        // 1. connect to server, await synchronized
        //
        // 2. create document
        //
        // 3. await creation
        //
        // 4. update document
        //
        // 5. await updated
        //
        // 6. create file
        //
        // 7. await created
        //
        // 8. delete file
        //
        // 9. await deleted
        //
        // const col = uuidv4()
        // const sinkron = new SinkronClient({ url: apiUrl, token: apiToken })
        // const permissions = Permissions.any()
        // const createRes = await sinkron.createCollection({ id: col, permissions })
        // assert(createRes.isOk, "create col")
        // const collection = new SinkronCollection({
        // url: "ws://localhost:3000/sync",
        // // @ts-ignore
        // webSocketImpl: WebSocket,
        // col,
        // token: "token-test",
        // noAutoReconnect: true
        // })
        // await awaitValue(() => collection.status === ConnectionStatus.Ready)
        // const doc = new LoroDoc()
        // doc.getText("text").insert(0, "Hello")
        // const id = collection.create(doc)
        // assert.strictEqual(
        // collection.items.get(id)!.state,
        // ItemState.ChangesSent,
        // "changes sent"
        // )
        // await awaitValue(
        // () => collection.items.get(id)!.state === ItemState.Synchronized
        // )
        // collection.destroy()
    })
})
*/
