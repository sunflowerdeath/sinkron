import path from 'node:path'

import { Sinkron, SinkronServer } from 'sinkron'
import type { ChangeMessage } from "sinkron"
import { v4 as uuidv4 } from 'uuid'
import * as Automerge from '@automerge/automerge'

import { App } from './app'

type Doc = {
    content: {
        children: any[]
    }
    num: number
}

const initial = {
    content: {
        children: [
            {
                type: 'paragraph',
                children: [{ text: 'Hello' }]
            }
        ]
    },
    num: 0
}

const dbPath = ':memory:'
// const dbPath = "./testdb.sqlite"

const run = async () => {
    const sinkron = new Sinkron({ dbPath })
    await sinkron.init()

    const app = new App({ sinkron, port: 80 })
    await app.init()

    let user
    const createUserResult = await app.controller.users.createUser(
        'test',
        'password'
    )
    if (createUserResult.isOk) user = createUserResult.value
    console.log('Created user', user)

    /*
    let space
    let createSpaceResult = await app.controller.spaces.create({
        ownerId: user!.id,
        name: "test"
    })
    if (createSpaceResult.isOk) space = createSpaceResult.value
    console.log('Created space', space)

    let m = await app.controller.spaces.addMember({
        userId: user!.id,
        spaceId: space!.id,
        role: "admin"
    })
    */

    app.start()

    /*
    let doc = Automerge.from<Doc>(initial)
    const [created] = await db.createDocument(
        uuidv4(),
        "test",
        Automerge.save(doc)
    )
    console.log("CREATED", created)

    doc = Automerge.change(doc, doc => {
        doc.num = 1
    })
    const change = Automerge.getLastLocalChange(doc)!
    const [updated] = await db.updateDocument(created.id, [change])

    console.log("UPDATED", updated)

    const docs = await db.getChangedDocuments("test")
    console.log("DOCS", docs)

    // const deleted = await db.deleteDocument(changed.id)
    // console.log("DELETED", deleted)
    */
}

run()
