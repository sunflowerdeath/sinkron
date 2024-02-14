import assert from 'node:assert'
import { Sinkron } from './server'
import * as Automerge from '@automerge/automerge'

import { v4 as uuidv4 } from 'uuid'

type Doc = {
    text: string
    num: number
}

const makeDoc = () => {
    let doc = Automerge.init<Doc>()
    doc = Automerge.change(doc, (doc) => {
        doc.text = 'Hello'
        doc.num = 0
    })
    return doc
}

describe('Sinkron', () => {
    let sinkron: Sinkron

    beforeEach(async () => {
        sinkron = new Sinkron({ dbPath: ':memory:' })
        await sinkron.init()
        await sinkron.createCollection('test')
    })

    it('create', async () => {
        const id = uuidv4()
        const doc = makeDoc()

        // collection does not exist
        const res = await sinkron.createDocument(
            id,
            'ERROR',
            Automerge.save(doc)
        )
        assert(!res.isOk)

        // created successfully
        const res1 = await sinkron.createDocument(
            id,
            'test',
            Automerge.save(doc)
        )
        assert(res1.isOk)
        assert.strictEqual(res1.value.id, id)

        // duplicate id
        const res2 = await sinkron.createDocument(
            id,
            'test',
            Automerge.save(doc)
        )
        assert(!res2.isOk)
    })

    it('update', async () => {
        const id = uuidv4()
        let doc = makeDoc()

        const res = await sinkron.createDocument(
            id,
            'test',
            Automerge.save(doc)
        )
        assert(res.isOk)
        assert.strictEqual(res.value.colrev, 2)

        // successfull update
        doc = Automerge.change(doc, (doc) => {
            doc.num = 100
        })
        const change = Automerge.getLastLocalChange(doc)!

        const res2 = await sinkron.updateDocument(id, [change])
        assert(res2.isOk)
        assert.strictEqual(res2.value.colrev, 3)
        const updatedDoc = Automerge.load<Doc>(res2.value.data!)
        assert.strictEqual(updatedDoc.num, 100)

        const res3 = await sinkron.updateDocument('WRONG_ID', [change])
        assert(!res3.isOk)

        // bad change
        const badChange = new Uint8Array([1, 2, 3])
        const res4 = await sinkron.updateDocument(id, [badChange])
        assert(!res4.isOk)
    })
})
