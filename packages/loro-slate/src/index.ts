import { LoroMap, LoroList, LoroText, Value, Container } from "loro-crdt"
import {
    Path,
    Node,
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

const toLoro = (node: Node): LoroMap<any> => {
    const map = new LoroMap()
    if (Text.isText(node)) {
        Object.entries(node).forEach(([key, value]) => {
            if (key === "text") {
                const text = new LoroText()
                text.insert(0, node.text)
                map.setContainer("text", text)
            } else {
                map.set(key, value)
            }
        })
    } else {
        Object.entries(node).forEach(([key, value]) => {
            if (key === "children" && Array.isArray(node.children)) {
                const children = new LoroList<LoroMap>()
                node.children.forEach((child: Node) => {
                    children.pushContainer(toLoro(child))
                })
                map.setContainer("children", children)
            } else {
                map.set(key, value)
            }
        })
    }
    return map
}

const fromLoro = (map: LoroMap): Node => {
    return map.toJSON()

    /*
    const node: { [key: string]: any } = {}
    map.entries().map(([key, value]) => {
        if (key === "text" && value instanceof LoroText) {
            node[key] = value.toString()
        } else if (key === "children" && value instanceof LoroList) {
            const children: Node[] = []
            for (let i = 0; i < value.length; i++) {
                const child = fromLoro(value.get(i) as LoroMap)
                children.push(child)
            }
            node.children = children
        } else {
            node[key] = value
        }
    })
    return node as Node
    */
}

const findNode = (root: LoroMap, path: Path): LoroMap<any> => {
    let node = root
    path.forEach((idx) => {
        const children = node.get("children")
        if (children instanceof LoroList && idx <= children.length - 1) {
            node = children.get(idx)
        } else {
            throw new Error("Invalid path")
        }
    })
    return node
}

const insertNode = (
    root: LoroMap<any>,
    op: InsertNodeOperation
): LoroMap<any> => {
    const path = op.path.slice(0, -1)
    const idx = op.path.at(-1) as number
    const parent = findNode(root, path)
    const children = parent.get("children")
    if (children instanceof LoroList) {
        children.insertContainer(idx, toLoro(op.node))
    } else {
        throw new Error("Invalid path")
    }
    return root
}

const moveNode = (root: LoroMap<any>, op: MoveNodeOperation): LoroMap<any> => {
    const fromPath = op.path.slice(0, -1)
    const fromIdx = op.path.at(-1) as number
    const fromParent = findNode(root, fromPath)
    const fromChildren = fromParent.get("children")
    if (!(fromChildren instanceof LoroList)) throw new Error("Invalid path")

    const toPath = op.newPath.slice(0, -1)
    const toIdx = op.newPath.at(-1) as number
    const toParent = findNode(root, toPath)
    const toChildren = toParent.get("children")
    if (!(toChildren instanceof LoroList)) throw new Error("Invalid path")

    const node = fromChildren.get(fromIdx)
    fromChildren.delete(fromIdx, 1)
    toChildren.insertContainer(toIdx, node)

    return root
}

const setNode = (root: LoroMap<any>, op: SetNodeOperation): LoroMap<any> => {
    const { properties: oldProperties, newProperties } = op
    const node = findNode(root, op.path)
    Object.entries(newProperties).forEach(([key, value]) => {
        if (value !== undefined) {
            node.set(key, value)
        } else {
            node.delete(key)
        }
    })
    Object.keys(oldProperties).forEach((key) => {
        if (!(key in newProperties)) node.delete(key)
    })
    return root
}

const removeNode = (
    root: LoroMap<any>,
    op: RemoveNodeOperation
): LoroMap<any> => {
    const path = op.path.slice(0, -1)
    const idx = op.path.at(-1) as number
    const parent = findNode(root, path)
    const children = parent.get("children")
    if (children instanceof LoroList) {
        children.delete(idx, 1)
    } else {
        throw new Error("Invalid path")
    }
    return root
}

const mergeNode = (
    root: LoroMap<any>,
    op: MergeNodeOperation
): LoroMap<any> => {
    const path = op.path.slice(0, -1)
    const idx = op.path.at(-1) as number
    const parent = findNode(root, path)

    const children = parent.get("children")
    if (!(children instanceof LoroList)) throw new Error("Invalid path")

    const toNode = children.get(idx - 1)
    const fromNode = children.get(idx)

    const text = toNode.get("text")
    if (text instanceof LoroText) {
        text.insert(text.length, fromNode.get("text").toString())
    } else {
        const toChildren = toNode.get("children")
        const fromChildren = fromNode.get("children")
        for (let i = 0; i < fromChildren.length; i++) {
            toChildren.pushContainer(fromChildren.get(i))
        }
    }

    children.delete(idx, 1)
    return root
}

const splitNode = (
    root: LoroMap<any>,
    op: SplitNodeOperation
): LoroMap<any> => {
    const path = op.path.slice(0, -1)
    const idx = op.path.at(-1) as number
    const parent = findNode(root, path)

    const children = parent.get("children")
    if (!(children instanceof LoroList)) throw new Error("Invalid path")

    const fromNode: LoroMap = children.get(idx)
    const toNode = new LoroMap()

    Object.entries(op.properties).forEach(([key, value]) => {
        toNode.set(key, value)
    })

    fromNode.entries().map(([key, value]) => {
        if (key === "text" && value instanceof LoroText) {
            const text = value.splice(
                op.position,
                value.length - op.position,
                ""
            )
            const toText = new LoroText()
            toText.insert(0, text)
            toNode.setContainer("text", toText)
        } else if (key === "children" && value instanceof LoroList) {
            const toChildren = new LoroList()
            for (let i = op.position; i < value.length; i++) {
                toChildren.pushContainer(value.get(i) as Container)
            }
            value.delete(op.position, value.length - op.position)
            toNode.setContainer("children", toChildren)
        } else {
            toNode.set(key, value as Value)
        }
    })

    children.insertContainer(idx + 1, toNode)
    return root
}

const insertText = (
    root: LoroMap<any>,
    op: InsertTextOperation
): LoroMap<any> => {
    const node = findNode(root, op.path)
    const text = node.get("text")
    if (!(text instanceof LoroText)) throw new Error("Invalid path")
    const offset = Math.min(text.length, op.offset)
    text.insert(offset, op.text)
    return root
}

const removeText = (
    root: LoroMap<any>,
    op: RemoveTextOperation
): LoroMap<any> => {
    const node = findNode(root, op.path)
    const text = node.get("text")
    if (!(text instanceof LoroText)) throw new Error("Invalid path")
    const offset = Math.min(text.length, op.offset)
    text.delete(offset, op.text.length)
    return root
}

const ops = {
    insert_node: insertNode,
    move_node: moveNode,
    remove_node: removeNode,
    set_node: setNode,
    merge_node: mergeNode,
    split_node: splitNode,
    insert_text: insertText,
    remove_text: removeText
}

const applyOperation = (root: LoroMap<any>, op: Operation) => {
    if (op.type === "set_selection") return
    // @ts-expect-error all operation types
    ops[op.type](root, op)
}

// Applies slate operations to automerge document
// Editor state has to match state of the automerge document.
const applySlateOps = (root: LoroMap<any>, ops: Operation[]) => {
    ops.forEach((op) => applyOperation(root, op))
}

export { applyOperation, applySlateOps, toLoro, fromLoro }
