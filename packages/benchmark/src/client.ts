import * as Automerge from "@automerge/automerge"
import { random, sample } from "lodash"
import WebSocket from "ws"
import { Collection, WebSocketTransport } from "sinkron-client"
import pino, { Logger } from "pino"

const numCols = 250
const numUsers = numCols * 2
const port = 8081
const actionTimeout = () => random(1000, 1500)

type Doc = {
    text: string
    num: number
}

const makeDoc = () => {
    let doc = Automerge.init<Doc>()
    doc = Automerge.change(doc, (doc) => {
        doc.text = "Hello"
        doc.num = 0
    })
    return doc
}

const client = (userid: string, colid: string) => {
    const logger: Logger<string> = pino({
        transport: { target: "pino-pretty" }
    })
    logger.level = "warn"
    const transport = new WebSocketTransport({
        url: `ws://localhost:${port}/${userid}`,
        // @ts-ignore
        webSocketImpl: WebSocket
    })
    const col = new Collection<Doc>({ col: colid, transport, logger })
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
                    doc.text += "Aa"
                })
            }
        }
        setTimeout(doSomething, actionTimeout())
    }
    setTimeout(doSomething, random(2000, 3000))
}

const timeout = (t: number) => new Promise(resolve => setTimeout(resolve, t))

const spawnClients = async () => {
    for (let i = 0; i < numUsers; i++) {
        const userid = `user-${i}`
        const colid = `cols/${random(numCols-1)}`
        client(userid, colid)
        await timeout(25)
    }
}

spawnClients()
