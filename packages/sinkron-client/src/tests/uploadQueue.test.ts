import assert from "node:assert"

import { v4 as uuidv4 } from "uuid"

import { FileApi } from "../fileApi"
import { type FileSource, BlobFileSource } from "../fileSource"
import { UploadQueue } from "../uploadQueue"
import { Deferred } from "../utils/deferred"

const apiUrl = "http://localhost:3000"
const apiToken = "SINKRON_API_TOKEN"
const authToken = "token-test"

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

        assert.strictEqual(queue.items.get(fileId)?.status.kind, "in_progress")
        assert(queue.isRunning)

        await isCompleted.promise

        assert.strictEqual(queue.items.get(fileId)?.status.kind, "completed")
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
