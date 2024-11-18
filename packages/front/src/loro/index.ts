import { LoroDoc, LoroMap, LoroText, LoroList } from "loro-crdt"
import {
    Path,
    Node,
    Element,
    Text,
    Operation,
    InsertNodeOperation,
    MoveNodeOperation,
    MergeNodeOperation,
    SetNodeOperation,
    RemoveNodeOperation,
    SplitNodeOperation,
    InsertTextOperation,
    RemoveTextOperation
} from "slate"

const toJS = (node: LoroDoc) => node.toJSON()

const toLoro = (node: Node): LoroMap => {
    const map = new LoroMap()
    for (let key in node) {
        if (key === "children" && Array.isArray(node.children)) {
            const children = new LoroList()
            node.children.forEach((child) => {
                children.push(toLoro(child))
            })
            map.setContainer("children", children)
        } else if (key === "text") {
            const text = new LoroText()
            text.insert(0, node.text)
            map.setContainer("text", text)
        } else {
            map.set(key, node[key])
        }
    }
    return map
}

const fromLoro = (node: LoroMap): Node => {

}

const findNode = (root: LoroMap, path: Path): LoroMap => {
    let node = root
    path.forEach((idx) => {
        if ("children" in node) {
            node = node.children[idx]
        } else {
            throw new Error("Invalid path")
        }
    })
    return node
}
