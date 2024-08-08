import * as Automerge from "@automerge/automerge"
import {
    Path,
    Node,
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

export type AutomergeNodeWithChildren = {
    children: AutomergeNode[]
    [key: string]: any
}
export type AutomergeTextNode = { text: Automerge.Text; [key: string]: any }
export type AutomergeNode = AutomergeNodeWithChildren | AutomergeTextNode

const toJS = (node: AutomergeNode) => JSON.parse(JSON.stringify(node))

const cloneNode = (node: AutomergeNode) => toAutomerge(toJS(node))

const toAutomerge = (node: Node): AutomergeNode => {
    if ("children" in node) {
        return { ...node, children: node.children.map(toAutomerge) }
    } else if ("text" in node) {
        return { ...node, text: new Automerge.Text(node.text) }
    }
    return node
}

const fromAutomerge = (node: AutomergeNode): Node => {
    if ("children" in node) {
        return { ...node, children: node.children.map(fromAutomerge) }
    } else if ("text" in node) {
        return { ...node, text: String(node.text) }
    }
    return node
}

const findNode = (root: AutomergeNode, path: Path): AutomergeNode => {
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

const insertNode = (
    root: AutomergeNode,
    op: InsertNodeOperation
): AutomergeNode => {
    const path = op.path.slice(0, -1)
    const idx = op.path.at(-1) as number
    const parent = findNode(root, path)
    if (!("children" in parent)) throw new Error("Invalid path")
    parent.children.splice(idx, 0, toAutomerge(op.node))
    return root
}

const moveNode = (
    root: AutomergeNode,
    op: MoveNodeOperation
): AutomergeNode => {
    const fromPath = op.path.slice(0, -1)
    const fromIdx = op.path.at(-1) as number
    const fromParent = findNode(root, fromPath)
    if (!("children" in fromParent)) throw new Error("Invalid path")

    const toPath = op.newPath.slice(0, -1)
    const toIdx = op.newPath.at(-1) as number
    const toParent = findNode(root, toPath)
    if (!("children" in toParent)) throw new Error("Invalid path")

    const [node] = fromParent.children.splice(fromIdx, 1)
    toParent.children.splice(toIdx, 0, cloneNode(node))

    return root
}

const removeNode = (
    root: AutomergeNode,
    op: RemoveNodeOperation
): AutomergeNode => {
    const path = op.path.slice(0, -1)
    const idx = op.path.at(-1) as number
    const parent = findNode(root, path)
    if (!("children" in parent)) throw new Error("Invalid path")
    parent.children.splice(idx, 1)
    return root
}

const setNode = (root: AutomergeNode, op: SetNodeOperation): AutomergeNode => {
    const node = findNode(root, op.path)

    const newProperties = op.newProperties as any
    for (const key in newProperties) {
        const val = newProperties[key]
        if (val !== undefined) {
            node[key] = val
        } else {
            delete node[key]
        }
    }

    const oldProperties = op.properties as any
    for (const key in oldProperties) {
        if (!(key in newProperties)) {
            delete node[key]
        }
    }

    return root
}

const mergeNode = (
    root: AutomergeNode,
    op: MergeNodeOperation
): AutomergeNode => {
    const path = op.path.slice(0, -1)
    const idx = op.path.at(-1) as number
    const parent = findNode(root, path)
    if (!("children" in parent)) throw new Error("Invalid path")

    const toNode = parent.children[idx - 1]
    const fromNode = parent.children[idx]

    if ("text" in toNode) {
        toNode.text.insertAt(
            toNode.text.length,
            ...String(fromNode.text).split("")
        )
    } else {
        toNode.children.push(...fromNode.children.map(cloneNode))
    }

    parent.children.deleteAt(idx)
    return root
}

const splitNode = (
    root: AutomergeNode,
    op: SplitNodeOperation
): AutomergeNode => {
    const path = op.path.slice(0, -1)
    const idx = op.path.at(-1) as number
    const parent = findNode(root, path)

    const fromNode = parent.children[idx]
    const toNode = { ...cloneNode(fromNode), ...op.properties }

    if ("text" in fromNode) {
        fromNode.text.deleteAt(op.position, fromNode.text.length - op.position)
        toNode.text.deleteAt(0, op.position)
    } else {
        fromNode.children.splice(
            op.position,
            fromNode.children.length - op.position
        )
        toNode.children.splice(0, op.position)
    }

    parent.children.insertAt(idx + 1, toNode)
    return root
}

const insertText = (
    root: AutomergeNode,
    op: InsertTextOperation
): AutomergeNode => {
    const node = findNode(root, op.path)
    const offset = Math.min(node.text.length, op.offset)
    node.text.insertAt(offset, ...op.text.split(""))
    return root
}

const removeText = (
    root: AutomergeNode,
    op: RemoveTextOperation
): AutomergeNode => {
    const node = findNode(root, op.path)
    const offset = Math.min(node.text.length, op.offset)
    node.text.deleteAt(offset, op.text.length)
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

const applyOperation = (root: AutomergeNode, op: Operation) => {
    if (op.type === "set_selection") return
    ops[op.type](root, op)
}

// Applies slate operations to automerge document
// Editor state has to match state of the automerge document.
const applySlateOps = (root: AutomergeNode, ops: Operation[]) => {
    ops.forEach((op) => applyOperation(root, op))
}

export { applyOperation, applySlateOps, toAutomerge, fromAutomerge }
