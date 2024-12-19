import { Element, Range, Transforms, Editor, Point, Node, Path } from "slate"
import { ReactEditor } from "slate-react"

export type BlockType =
    | "heading"
    | "list"
    | "ordered-list"
    | "check-list"
    | "code"

export type TextMarkType = "bold" | "italic" | "underline" | "strikethrough"

export const isNodeActive = (editor: Editor, type: string, at?: Path) => {
    const { selection } = editor
    if (!selection) return false
    const nodes = Array.from(
        Editor.nodes(editor, {
            match: (n) => Element.isElementType(n, type),
            at
        })
    )
    return nodes.length > 0
}

const listTypes = ["list", "ordered-list", "check-list"]

export const toggleBlock = (editor: Editor, type: BlockType) => {
    const isActive = isNodeActive(editor, type)
    Transforms.unwrapNodes(editor, {
        match: (n) => Element.isElement(n) && listTypes.includes(n.type),
        split: true
    })
    if (isActive) {
        Transforms.setNodes(editor, { type: "paragraph" })
    } else {
        if (listTypes.includes(type)) {
            const itemType =
                type === "check-list" ? "check-list-item" : "list-item"
            Transforms.setNodes(editor, { type: itemType })
            // @ts-expect-error wrap doesn't need "children"
            Transforms.wrapNodes(editor, { type })
        } else {
            // @ts-expect-error
            Transforms.setNodes(editor, { type })
        }
    }
}

export const isMarkActive = (editor: ReactEditor, format: TextMarkType) => {
    const marks = Editor.marks(editor)
    return marks ? marks[format] === true : false
}

export const toggleMark = (editor: ReactEditor, format: TextMarkType) => {
    const isActive = isMarkActive(editor, format)
    if (isActive) {
        Editor.removeMark(editor, format)
    } else {
        Editor.addMark(editor, format, true)
    }
}

export const isAtEndOfNode = (
    editor: Editor,
    type: string
): Element | undefined => {
    const { selection } = editor
    if (!selection || !Range.isCollapsed(selection)) return
    const [res] = Editor.nodes(editor, {
        match: (node) => Element.isElementType(node, type)
    })
    if (!res) return
    const [node, path] = res
    if (!Element.isElement(node)) return
    const end = Editor.end(editor, path)
    return Point.equals(selection.anchor, end) ? node : undefined
}

export const isAfterNode = (editor: Editor, type: string): boolean => {
    const { selection } = editor
    if (!selection || !Range.isCollapsed(selection)) return false
    if (selection.anchor.offset !== 0) return false
    const before = Editor.before(editor, selection.anchor.path)
    return before !== undefined && isNodeActive(editor, type, before.path)
}

// This fixes selection when elements may be deleted by remote user
export const checkSelectionPoint = (editor: Editor, point: Point) => {
    const nodes = Editor.nodes(editor, { at: point })

    let node: Node = editor
    let path: Path = []
    let error = false
    while (true) {
        let res
        try {
            res = nodes.next()
        } catch {
            error = true
            break
        }
        if (res.value === undefined) break
        node = res.value[0]
        path = res.value[1]
    }

    if (error) {
        // Couldn't find node by given path
        return Editor.start(editor, path)
    }

    // TODO check how it works with nested blocks and voids

    if (!("text" in node)) {
        // Node is not a text node, so text offset is not valid
        return Editor.start(editor, path)
    }

    // Limit offset to text length in the node
    return { path, offset: Math.min(node.text.length, point.offset) }
}
