import assert from "node:assert"

import { WebSocket } from "ws"
import { v4 as uuidv4 } from "uuid"
import { LoroDoc } from "loro-crdt"

import { SinkronClient, Permissions } from "../client"

import { autorun } from "mobx"

const awaitValue = async (fn: () => boolean): Promise<void> =>
    new Promise((resolve) => {
        const dispose = autorun(() => {
            if (fn()) {
                dispose()
                resolve()
            }
        })
    })

const apiUrl = "http://localhost:3000"
const apiToken = "SINKRON_API_TOKEN"

import { SinkronCollection, ConnectionStatus, ItemState } from "../collection"

describe("SinkronCollection", () => {
    it("create", async () => {
        const col = uuidv4()

        const sinkron = new SinkronClient({ url: apiUrl, token: apiToken })
        const permissions = Permissions.any()
        const createRes = await sinkron.createCollection({ id: col, permissions })
        assert(createRes.isOk, "create col")

        const collection = new SinkronCollection({
            url: "ws://localhost:3000/sync",
            // @ts-ignore
            webSocketImpl: WebSocket,
            col,
            token: "token-test",
            noAutoReconnect: true
        })

        await awaitValue(() => collection.status === ConnectionStatus.Ready)

        const doc = new LoroDoc()
        doc.getText("text").insert(0, "Hello")
        const id = collection.create(doc)

        assert.strictEqual(
            collection.items.get(id)!.state,
            ItemState.ChangesSent,
            "changes sent"
        )
        await awaitValue(
            () => collection.items.get(id)!.state === ItemState.Synchronized
        )

        collection.destroy()
    })
})
