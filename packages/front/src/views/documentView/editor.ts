import {
    createEditor,
    Path,
    Node,
    Transforms,
    MoveUnit,
    Editor,
    Element,
    Text
} from "slate"
import { withReact, ReactEditor } from "slate-react"

import {
    isAtEndOfNode,
    isAfterNode,
    isNodeActive,
    toggleBlock
} from "./helpers"

export type CreateEditorProps = {
    uploadImage: (file: File) => void
}

const createSinkronEditor = (props: CreateEditorProps): ReactEditor => {
    const editor = withReact(createEditor())
    const { normalizeNode, insertBreak, insertData, deleteBackward } = editor

    editor.insertData = (data) => {
        const { files } = data
        if (files && files.length > 0) {
            Array.from(files).map((file) => {
                const [mime] = file.type.split("/")
                if (mime === "image") props.uploadImage(file)
            })
        } else {
            insertData(data)
        }
    }

    const closeList = (type: "list" | "ordered-list" | "check-list") => {
        Transforms.unwrapNodes(editor, {
            match: (n) => Element.isElementType(n, type),
            split: true
        })
        Transforms.setNodes(editor, { type: "paragraph" })
    }

    editor.insertBreak = () => {
        const heading = isAtEndOfNode(editor, "heading")
        if (heading) {
            if (Editor.isEmpty(editor, heading)) {
                // Convert to paragraph if the node is a heading and empty
                Transforms.setNodes(editor, { type: "paragraph" })
            } else {
                // Insert a new paragraph
                Transforms.insertNodes(editor, {
                    type: "paragraph",
                    children: [{ text: "" }]
                })
            }
            return
        }

        const listItem = isAtEndOfNode(editor, "list-item")
        if (listItem && Editor.isEmpty(editor, listItem)) {
            if (isNodeActive(editor, "list")) {
                closeList("list")
                return
            }
            if (isNodeActive(editor, "ordered-list")) {
                closeList("ordered-list")
                return
            }
        }

        const checkListItem = isAtEndOfNode(editor, "check-list-item")
        if (checkListItem && Editor.isEmpty(editor, checkListItem)) {
            closeList("check-list")
            return
        }

        insertBreak()
    }

    editor.deleteBackward = (unit) => {
        if (unit === "character") {
            if (isAfterNode(editor, "image")) {
                const parentPath = Path.parent(editor.selection!.anchor.path)
                const parentNode = Node.get(editor, parentPath)
                const parentIsEmpty =
                    Element.isElement(parentNode) &&
                    Editor.isEmpty(editor, parentNode)
                if (parentIsEmpty) {
                    Transforms.removeNodes(editor)
                    return
                } else {
                    Transforms.move(editor, {
                        unit: "block" as MoveUnit,
                        reverse: true
                    })
                    return
                }
            }

            if (isAtEndOfNode(editor, "list")) {
                const listItem = isAtEndOfNode(editor, "list-item")
                if (listItem && Editor.isEmpty(editor, listItem)) {
                    toggleBlock(editor, "list")
                    return
                }
            }

            if (isAtEndOfNode(editor, "ordered-list")) {
                const listItem = isAtEndOfNode(editor, "list-item")
                if (listItem && Editor.isEmpty(editor, listItem)) {
                    toggleBlock(editor, "ordered-list")
                    return
                }
            }

            if (isAtEndOfNode(editor, "check-list")) {
                const checkListItem = isAtEndOfNode(editor, "check-list-item")
                if (checkListItem && Editor.isEmpty(editor, checkListItem)) {
                    toggleBlock(editor, "check-list")
                    return
                }
            }
        }

        deleteBackward(unit)
    }

    editor.isInline = (elem) => elem.type === "link"

    editor.isVoid = (elem) => elem.type === "image"

    editor.normalizeNode = (entry) => {
        const [node, path] = entry

        // Ensure that first and only first node is of type 'title'
        if (path.length === 0) {
            for (const [child, childPath] of Node.children(editor, path)) {
                const index = childPath[0]
                if (index === 0) {
                    if (Element.isElement(child) && child.type !== "title") {
                        Transforms.setNodes(
                            editor,
                            { type: "title" },
                            { at: childPath }
                        )
                        return
                    }
                } else {
                    if (Element.isElement(child) && child.type === "title") {
                        Transforms.setNodes(
                            editor,
                            { type: "paragraph" },
                            { at: childPath }
                        )
                        return
                    }
                }
            }
        }

        // Ensure that last element is paragraph
        if (Editor.isEditor(node)) {
            const lastChild = node.children[node.children.length - 1]
            if (!Element.isElementType(lastChild, "paragraph")) {
                Transforms.insertNodes(
                    editor,
                    { type: "paragraph", children: [{ text: "" }] },
                    { at: [editor.children.length] }
                )
                return
            }
        }

        // Remove empty links
        if (
            Element.isElementType(node, "link") &&
            Editor.isEmpty(editor, node)
        ) {
            Transforms.removeNodes(editor, { at: path })
            return
        }

        const elementsWithInlineChildren = [
            "paragraph",
            "list-item",
            "check-list-item",
            "heading",
            "title"
        ]
        if (
            Element.isElement(node) &&
            elementsWithInlineChildren.includes(node.type)
        ) {
            for (const [child, childPath] of Node.children(editor, path)) {
                if (Element.isElement(child) && !editor.isInline(child)) {
                    Transforms.unwrapNodes(editor, { at: childPath })
                    return
                }
            }
        }

        const isCodeBlock = Element.isElementType(node, "code-block")
        if (isCodeBlock) {
            for (const [child, childPath] of Node.children(editor, path)) {
                if (Text.isText(child)) {
                    Transforms.wrapNodes(
                        editor,
                        // @ts-expect-error wrap doesn't need "children"
                        { type: "code-line" },
                        { at: childPath }
                    )
                    return
                }
                if (Element.isElement(child) && child.type !== "code-line") {
                    Transforms.setNodes(
                        editor,
                        { type: "code-line" },
                        { at: childPath }
                    )
                    return
                }
            }
        }

        const isCodeLine = Element.isElementType(node, "code-line")
        if (isCodeLine) {
            // No orphan code lines
            const parent = Node.parent(editor, path)
            if (!Element.isElementType(parent, "code-block")) {
                Transforms.setNodes(editor, { type: "paragraph" }, { at: path })
                return
            }
            // Only text elements inside code lines
            for (const [child, childPath] of Node.children(editor, path)) {
                if (!Text.isText(child)) {
                    Transforms.unwrapNodes(editor, { at: childPath })
                    return
                }
            }
        }

        // Ensure all children of list are correct list-items
        const isList = Element.isElementType(node, "list")
        const isOrderedList = Element.isElementType(node, "ordered-list")
        const isCheckList = Element.isElementType(node, "check-list")
        if (isOrderedList || isList || isCheckList) {
            const itemType =
                isList || isOrderedList ? "list-item" : "check-list-item"
            for (const [child, childPath] of Node.children(editor, path)) {
                if (Text.isText(child)) {
                    Transforms.wrapNodes(
                        editor,
                        // @ts-expect-error wrap doesn't need "children"
                        { type: itemType },
                        { at: childPath }
                    )
                    return
                }
                if (Element.isElement(child) && child.type !== itemType) {
                    Transforms.setNodes(
                        editor,
                        { type: itemType },
                        { at: childPath }
                    )
                    return
                }
            }
        }

        normalizeNode(entry)
    }

    // @ts-expect-error expose global editor for debug
    window.editor = editor

    return editor
}

export { createSinkronEditor }
