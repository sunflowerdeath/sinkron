import assert from "node:assert"

import { WebSocket } from "ws"
import { v4 as uuidv4 } from "uuid"
import { LoroDoc } from "loro-crdt"

import { SinkronApi } from "../api"
import { Permissions } from "../permissions"

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

let apiUrl = "http://localhost:3000"
let apiToken = "SINKRON_API_TOKEN"

import { Collection, ConnectionStatus, ItemState } from "../collection"

describe("Collection", () => {
    it("create", async () => {
        let col = uuidv4()

        let api = new SinkronApi({ url: apiUrl, token: apiToken })
        let permissions = new Permissions()
        let createRes = await api.createCollection({ id: col, permissions })
        assert(createRes.isOk, "create col")

        const collection = new Collection({
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
