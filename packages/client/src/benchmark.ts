import { LoroDoc } from "loro-crdt"
import { random, sample } from "lodash-es"
import pino, { Logger } from "pino"
// import { WebSocket } from "ws"

import { SinkronClient, Permissions } from "./client"
import { SinkronCollection } from "./collection"

const numCols = 25 // 250
const numUsers = numCols * 2
const actionTimeout = () => random(1000, 1500)

const makeDoc = () => {
    let doc = new LoroDoc()
    doc.getText("text").insert(0, "Hello")
    return doc
}

const client = (userid: string, colid: string) => {
    const logger: Logger<string> = pino({
        transport: { target: "pino-pretty" }
    })
    logger.level = "info"
    const col = new SinkronCollection({
        col: colid,
        url: `ws://localhost:3337/sync`,
        logger,
        token: `token-${userid}`
        // @ts-ignore
        // webSocketImpl: WebSocket
    })
    const doSomething = () => {
        const n = random(100)
        if (col.items.size === 0 || n <= 10) {
            // 10% to create document
            col.create(makeDoc())
        } else if (
            col.items.size > 100 ? 10 <= n && n <= 20 : 10 <= n && n <= 15
        ) {
            // 5% to delete document (or 10% when 100+ items)
            const id = sample(Array.from(col.items.keys()))!
            if (col.items.get(id)!.local !== null) {
                col.delete(id)
            }
        } else {
            // change document
            const id = sample(Array.from(col.items.keys()))!
            if (col.items.get(id)!.local !== null) {
                col.change(id, (doc) => {
                    let text = doc.getText("text")
                    text.insert(text.length, "Aa ")
                })
            }
        }
        setTimeout(doSomething, actionTimeout())
    }
    setTimeout(doSomething, random(2000, 3000))
}

const timeout = (t: number) => new Promise((resolve) => setTimeout(resolve, t))

const spawnClients = async () => {
    const api = new SinkronClient({
        url: "http://localhost:3337",
        token: "SINKRON_API_TOKEN"
    })

    for (let i = 0; i < numCols; i++) {
        const col = `cols/${i}`
        const permissions = Permissions.any()
        await api.createCollection({ id: col, permissions })
    }

    for (let i = 0; i < numUsers; i++) {
        const userid = `user-${i}`
        const colid = `cols/${random(numCols - 1)}`
        client(userid, colid)
        await timeout(25)
    }
}

spawnClients()
