import { createServer } from "node:http"

import * as Automerge from "@automerge/automerge"
import { random, sample } from "lodash"
import WebSocket from "ws"
import { Collection, WebSocketTransport } from "sinkron-client"

const numCols = 10
const numUsers = 100
const port = 8081

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
    const transport = new WebSocketTransport({
        url: `ws://localhost:${port}/${userid}`,
        webSocketImpl: WebSocket
    })
    const col = new Collection<Doc>({ col: colid, transport })
    const doSomething = () => {
        const n = random(10)
        if (col.items.size === 0 || n === 1) {
            col.create(makeDoc())
        } else if (n === 2) {
            const id = sample(Array.from(col.items.keys()))!
            col.delete(id)
        } else {
            const id = sample(Array.from(col.items.keys()))!
            col.change(id, (doc) => {
                doc.text += "Aa"
            })
        }
        setTimeout(doSomething, random(2000, 10000))
    }
    setTimeout(doSomething, random(2000, 10000))
}

const spawnClients = () => {
    for (let i = 0; i < numUsers; i++) {
        const userid = `user-${i}`
        const colid = `cols/${random(numCols)}`
        client(userid, colid)
    }
}

spawnClients()
