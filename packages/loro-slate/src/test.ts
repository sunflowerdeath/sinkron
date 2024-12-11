import assert from "node:assert"
import util from "node:util"

import { LoroDoc } from "loro-crdt"
import { createEditor, Operation, Node, Text, Element } from "slate"

import { applySlateOps, fromLoro, toLoro } from "./index"

type CustomElement = {
    type?: string
    key?: string
    children: CustomElement[] | Text[]
}

declare module "slate" {
    interface CustomTypes {
        Element: CustomElement
    }
}

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
                        { type: "A", text: "Two" }
                    ]
                },
                { type: "paragraph", children: [{ text: "Three" }] }
            ]
        }
    ]
}

const testOps: { [key: string]: Operation } = {
    insert_node: {
        type: "insert_node",
        path: [2, 2],
        node: { type: "paragraph", children: [{ text: "Three" }] }
    },
    remove_node: {
        type: "remove_node",
        path: [2, 0],
        node: { type: "paragraph", children: [{ text: "One" }] }
    },
    move_node: {
        type: "move_node",
        path: [2, 0],
        newPath: [1]
    },
    set_node: {
        type: "set_node",
        path: [1],
        properties: {},
        newProperties: { key: "value" }
    },
    merge_node: {
        type: "merge_node",
        path: [2, 0, 1],
        position: 1,
        properties: {}
    },
    merge_node_text: {
        type: "merge_node",
        path: [2, 1],
        position: 1,
        properties: {}
    },
    split_node: {
        type: "split_node",
        path: [2, 0],
        position: 1,
        properties: { type: "paragraph" }
    },
    split_node_text: {
        type: "split_node",
        path: [0, 0],
        position: 2,
        properties: {}
    },
    insert_text: {
        type: "insert_text",
        path: [0, 0],
        offset: 5,
        text: ", world!"
    },
    remove_text: {
        type: "remove_text",
        path: [0, 0],
        offset: 2,
        text: "llo"
    }
}

const LOG_ON = false

const log = (a: string) => {
    if (LOG_ON) console.log(a)
}

const logObject = (obj: object) => {
    if (LOG_ON) console.log(util.inspect(obj, { depth: null }))
}

const testOp = (op: Operation) => {
    log("Op:")
    logObject(op)

    // create loro doc
    const doc = new LoroDoc()
    const loroRoot = toLoro(root as Node)
    // @ts-expect-error
    doc.getMap<any>("doc").set("root", loroRoot)

    // create editor and set its state
    const editor = createEditor()
    editor.children = (fromLoro(loroRoot) as Element).children

    // apply operation on the editor state
    editor.apply(op)
    const expected = editor.children

    // apply operation on the loro doc
    applySlateOps(loroRoot, [op])
    const changed = (fromLoro(loroRoot) as Element).children

    log("Expected:")
    logObject(expected)
    log("Changed:")
    logObject(changed)

    assert.deepEqual(expected, changed)
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

    it("merge_node_text", () => {
        testOp(testOps["merge_node_text"])
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

    // slate gives wrong result ?
    // it("split_node_text", () => {
    // testOp(testOps["split_node_text"])
    // })

    it("insert_text", () => {
        testOp(testOps["insert_text"])
    })

    it("remove_text", () => {
        testOp(testOps["remove_text"])
    })
})

/*
const getChange = (cb: any) => {
    const doc = Automerge.from(toAutomerge(root))
    const changed = Automerge.change(doc, cb)
    const change = Automerge.getLastLocalChange(changed)!
    return Automerge.decodeChange(change)
}

describe("slateToAutomerge", () => {
    it("hz", () => {
        for (const key in testOps) {
            const op = testOps[key]
            const change = getChange((doc) => {
                applySlateOps(doc, [op])
            })
            console.log("OP: ", op)
            logObject(change)
        }
    })
})
*/
