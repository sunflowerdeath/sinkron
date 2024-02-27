import assert from "node:assert"
import util from "node:util"

import * as Automerge from "@automerge/automerge"
import { createEditor, Operation } from "slate"

import { applySlateOps, fromAutomerge, toAutomerge } from "./index"

const root = {
    children: [
        { type: "paragraph", children: [{ text: "Hello" }] },
        { type: "image", src: "test", children: [{ text: "" }] },
        {
            type: "block",
            children: [
                {
                    type: "paragraph",
                    children: [
                        { type: "B", text: "One" },
                        { type: "A", text: "Two" },
                    ],
                },
                { type: "paragraph", children: [{ text: "Three" }] },
            ],
        },
    ],
}

const testOps: { [key: string]: Operation } = {
    insert_node: {
        type: "insert_node",
        path: [2, 2],
        node: { type: "paragraph", children: [{ text: "Three" }] },
    },
    remove_node: {
        type: "remove_node",
        path: [2, 0],
        node: { type: "paragraph", children: [{ text: "One" }] },
    },
    move_node: {
        type: "move_node",
        path: [2, 0],
        newPath: [1],
    },
    set_node: {
        type: "set_node",
        path: [1],
        newProperties: { key: "value" },
    },
    merge_node: {
        type: "merge_node",
        path: [2, 1],
        position: 1,
        properties: {},
    },
    split_node: {
        type: "split_node",
        path: [2, 0],
        position: 1,
        properties: { type: "paragraph" },
    },
    insert_text: {
        type: "insert_text",
        path: [0, 0],
        offset: 5,
        text: ", world!",
    },
    remove_text: {
        type: "remove_text",
        path: [0, 0],
        offset: 2,
        text: "llo",
    },
}

const logObject = (obj: Object) => {
    console.log(util.inspect(obj, { depth: null }))
}

const testOp = (op: Operation) => {
    // console.log("Op:")
    // logObject(op)

    // create Automerge doc
    const initial = Automerge.from(toAutomerge(root))

    // create editor and set its state
    const editor = createEditor()
    editor.children = fromAutomerge(initial).children

    // apply operation on the editor state
    editor.apply(op)
    const expected = editor.children

    // console.log("Expected:")
    // logObject(expected)

    // apply operation on the automerge doc
    const changedDoc = Automerge.change(initial, (doc) => {
        applySlateOps(doc, [op])
    })
    const changed = fromAutomerge(changedDoc).children

    // console.log("Changed:")
    // logObject(changed)

    assert.deepEqual(changed, expected)
}

describe("applySlateOps", () => {
    it("insert_node", () => {
        testOp(testOps["insert_node"])
    })

    it("remove_node", () => {
        testOp(testOps["remove_node"])
    })

    it("merge_node", () => {
        testOp(testOps["merge_node"])
    })

    it("move_node", () => {
        testOp(testOps["move_node"])
    })

    it("set_node", () => {
        testOp(testOps["set_node"])
    })

    it("split_node", () => {
        testOp(testOps["split_node"])
    })

    it("insert_text", () => {
        testOp(testOps["insert_text"])
    })

    it("remove_text", () => {
        testOp(testOps["remove_text"])
    })
})

const getChange = (cb: any) => {
        const doc = Automerge.from(toAutomerge(root))
        const changed = Automerge.change(doc, cb)
        const change = Automerge.getLastLocalChange(changed)!
        return Automerge.decodeChange(change)
}

describe("applyAutomergeToSlate", () => {
    it("test", () => {
        for (let key in testOps) {
            const op = testOps[key]
            const change = getChange(doc => {
                applySlateOps(doc, [op])
            })
            // console.log("OP: ", op)
            // logObject(change)
        }
    })
})
