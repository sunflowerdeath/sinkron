import { LoroDoc } from "loro-crdt"
import { random, sample } from "lodash-es"
import pino, { Logger } from "pino"

import { SinkronClient, Permissions } from "./client"
import { SinkronCollection } from "./collection"

const numCols = 100 // 250
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
    logger.level = "warn"
    const col = new SinkronCollection({
        col: colid,
        url: `ws://localhost:3337/sync`,
        logger,
        token: `token-${userid}`
    })
    const doSomething = () => {
        const n = random(20)
        if (col.items.size == 0 || n === 1 || n == 2) {
            // 10% to create document
            col.create(makeDoc())
        } else if (n === 3) {
            // 5% to delete document
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
