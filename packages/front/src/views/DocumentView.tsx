import { useState, useCallback, useMemo } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { observer } from "mobx-react-lite"
import { useLocation, Redirect } from "wouter"
import { useMedia } from "react-use"
import {
    createEditor,
    Node,
    Transforms,
    Editor,
    Point,
    Path,
    Element,
    Text
} from "slate"
import { useSlate, withReact, ReactEditor, Slate, Editable } from "slate-react"
import { Row } from "oriente"
import { without } from "lodash-es"
import * as Automerge from "@automerge/automerge"

import expandLessSvg from "@material-design-icons/svg/outlined/expand_less.svg"
import arrowBackSvg from "@material-design-icons/svg/outlined/arrow_back.svg"
import moreHorizSvg from "@material-design-icons/svg/outlined/more_horiz.svg"

import { useSpace } from "../store"
import type { Document } from "../entities"
import { fromAutomerge, applySlateOps } from "../slate"
import SelectCategoriesView from "../views/SelectCategoriesView"
import CategoriesList from "../components/CategoriesList"
import { Button, LinkButton, Icon, Menu, MenuItem } from "../ui"

const useForceUpdate = () => {
    const [_state, setState] = useState({})
    const forceUpdate = useCallback(() => {
        setState(() => ({}))
    }, [])
    return forceUpdate
}

interface Paragraph {
    type: "paragraph"
}

interface Title {
    type: "title"
}

interface List {
    type: "list"
}

const renderElement = (props) => {
    switch (props.element.type) {
        case "paragraph":
            return <p {...props.attributes}>{props.children}</p>
        case "title":
            return (
                <div
                    style={{ fontSize: 24, marginBottom: 30, fontWeight: 650 }}
                    {...props.attributes}
                >
                    {props.children}
                </div>
            )
        case "heading":
            return <h3 {...props.attributes}>{props.children}</h3>
        case "code":
            return (
                <pre
                    style={{ padding: 8, border: "2px solid #555" }}
                    {...props.attributes}
                >
                    {props.children}
                </pre>
            )
        case "list":
            return <ul {...props.attributes}>{props.children}</ul>
        case "ordered-list":
            return <ol {...props.attributes}>{props.children}</ol>
        case "list-item":
            return <li {...props.attributes}>{props.children}</li>
    }
    return <span {...props.attributes}>{props.children}</span>
}

const isNodeActive = (editor: Editor, type: string) => {
    const { selection } = editor
    if (!selection) return false
    const nodes = Array.from(
        Editor.nodes(editor, { match: (n) => n.type === type })
    )
    return nodes.length > 0
}

type Block = "heading" | "list" | "ordered-list" | "check-list" | "code"

const listTypes: Block[] = ["list", "ordered-list", "check-list"]

const toggleBlock = (editor: Editor, type: Block) => {
    const isActive = isNodeActive(editor, type)
    Transforms.unwrapNodes(editor, {
        match: (n) => listTypes.includes(n.type),
        split: true
    })
    if (isActive) {
        Transforms.setNodes(editor, { type: "paragraph" })
    } else {
        if (listTypes.includes(type)) {
            Transforms.setNodes(editor, { type: "list-item" })
            Transforms.wrapNodes(editor, { type })
        } else {
            Transforms.setNodes(editor, { type })
        }
    }
}

const createDocumentEditor = (onChange: any): ReactEditor => {
    const editor = withReact(createEditor())
    const { normalizeNode } = editor
    // editor.onChange = onChange
    editor.normalizeNode = (entry) => {
        const [node, path] = entry
        if (path.length === 0) {
            for (const [child, childPath] of Node.children(editor, path)) {
                const index = childPath[0]
                if (index === 0) {
                    if (child.type !== "title") {
                        Transforms.setNodes(
                            editor,
                            { type: "title" },
                            { at: childPath }
                        )
                        return
                    }
                } else {
                    if (child.type === "title") {
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

        const elementsWithInlineChildren = [
            "paragraph",
            "list-item",
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

        if (Element.isElement(node) && node.type === "list") {
            for (const [child, childPath] of Node.children(editor, path)) {
                if (Text.isText(child)) {
                    Transforms.wrapNodes(
                        editor,
                        { type: "list-item" },
                        { at: childPath }
                    )
                    return
                }
                if (Element.isElement(child) && child.type !== "list-item") {
                    Transforms.setNodes(
                        editor,
                        { type: "list-item" },
                        { at: childPath }
                    )
                    return
                }
            }
        }

        normalizeNode(entry)
    }
    window.editor = editor
    return editor
}

interface EditorViewProps {
    doc: Automerge.Doc<Document>
    onChange: (editor: ReactEditor) => void
}

const checkSelection = (editor: Editor, point: Point) => {
    const nodes = Editor.nodes(editor, { at: point })

    let node: Node = editor
    let path: Path = []
    let error = false
    while (true) {
        let res
        try {
            res = nodes.next()
        } catch (e) {
            error = true
            break
        }
        if (res.value === undefined) break
        node = res.value[0]
        path = res.value[1]
    }

    if (error) {
        return Editor.start(editor, path)
    }

    // TODO later check how it works with nested blocks
    // and voids

    if (!("text" in node)) {
        return Editor.start(editor, path)
    }

    return { path, offset: Math.min(node.text.length, point.offset) }
}

const Toolbar = () => {
    const editor = useSlate()
    const nodes = [
        { type: "heading", label: "H" },
        { type: "list", label: "-" },
        { type: "ordered-list", label: "1." },
        { type: "code", label: "<>" }
    ]
    return (
        <Row gap={4}>
            {nodes.map(({ type, label }) => (
                <Button
                    kind={isNodeActive(editor, type) ? "solid" : "transparent"}
                    onClick={() => toggleBlock(editor, type)}
                >
                    {label}
                </Button>
            ))}
        </Row>
    )
}

const EditorView = observer((props: EditorViewProps) => {
    const { doc, onChange } = props

    const isMobile = useMedia("(max-width: 1023px)")
    const forceUpdate = useForceUpdate()

    const editor = useMemo(
        () =>
            createDocumentEditor((hz) => {
                // console.log("onchange", operation)
                // onChange?.(editor)
            }),
        []
    )
    const value = useMemo(() => {
        //
        return (fromAutomerge(doc.content) as any).children
    }, [doc])
    useMemo(() => {
        console.log(value)
        editor.children = value

        if (editor.selection !== null) {
            editor.selection = {
                anchor: checkSelection(editor, editor.selection.anchor),
                focus: checkSelection(editor, editor.selection.focus)
            }
        }

        forceUpdate()
    }, [value])

    return (
        <>
            <Slate
                initialValue={value}
                editor={editor}
                onChange={(a) => {
                    // Prevent bug firing twice on Android
                    if (!editor.operations.fired) {
                        onChange?.(editor)
                        editor.operations.fired = true
                    }
                }}
            >
                <Toolbar />
                <Editable
                    renderElement={renderElement}
                    style={{
                        padding: isMobile ? 10 : 40,
                        paddingTop: 20,
                        paddingBottom: isMobile ? 0 : 60,
                        outline: "none",
                        flexGrow: 1
                        // overflow: "auto"
                    }}
                    autoFocus
                    placeholder="Empty document"
                    renderPlaceholder={({ children, attributes }) => {
                        return (
                            <div
                                {...attributes}
                                style={{
                                    opacity: 0.4,
                                    position: "absolute",
                                    top: 20,
                                    left: isMobile ? 10 : 40,
                                    pointerEvents: "none",
                                    userSelect: "none"
                                }}
                            >
                                {children}
                            </div>
                        )
                    }}
                />
            </Slate>
        </>
    )
})

interface DocumentViewProps {
    id: string
}

const DocumentView = observer((props: DocumentViewProps) => {
    const { id } = props

    const space = useSpace()
    const [_location, navigate] = useLocation()
    const isMobile = useMedia("(max-width: 1023px)")

    const item = space.collection.items.get(id)
    if (item === undefined || item.local === null) {
        return <Redirect to="/" />
    }

    const doc = item.local

    const onChange = (editor: ReactEditor) => {
        const ops = editor.operations.filter(
            (op) => op.type !== "set_selection"
        )
        if (ops.length > 0) {
            space.collection.change(id, (doc) => {
                console.log(ops)
                applySlateOps(doc.content, ops)
            })
        }
    }

    const onDelete = () => {
        space.collection.delete(id)
        navigate("/")
    }

    const menu = () => (
        <>
            <MenuItem>Share</MenuItem>
            <MenuItem>Copy to another space</MenuItem>
            <MenuItem>Publish</MenuItem>
            <MenuItem onSelect={onDelete}>Delete</MenuItem>
        </>
    )

    let categoriesList
    if (doc.categories.length > 0) {
        categoriesList = (
            <Row gap={8} align="center" style={{ width: "100%" }}>
                <div style={{ overflow: "scroll" }}>
                    <CategoriesList
                        items={doc.categories.map(
                            (id) => space.meta.categories[id]!
                        )}
                        onRemove={(c) => {
                            space.collection.change(id, (doc) => {
                                doc.categories = without(doc.categories, c)
                            })
                        }}
                    />
                </div>
                <Button size="s" onClick={() => setShowSelect(true)}>
                    <Icon svg={expandLessSvg} />
                </Button>
            </Row>
        )
    } else {
        categoriesList = (
            <Button kind="faint" size="s" onClick={() => setShowSelect(true)}>
                Select categories
            </Button>
        )
    }

    let selectCategories: React.ReactNode
    const [showSelect, setShowSelect] = useState(false)
    if (showSelect) {
        selectCategories = (
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    height: "100dvh",
                    width: "100%",
                    background: "var(--color-background)",
                    overflow: "scroll"
                }}
            >
                <SelectCategoriesView
                    value={doc.categories}
                    onChange={(value) => {
                        space.collection.change(id, (doc) => {
                            doc.categories = value
                        })
                    }}
                    tree={space.categoryTree}
                    categories={space.categoryMap}
                    onClose={() => setShowSelect(false)}
                />
            </div>
        )
    }

    const menuButton = (
        <Menu
            menu={menu}
            styles={{ list: { background: "#555" } }}
            placement={{ padding: 0, offset: 8, align: "end" }}
            autoSelectFirstItem={false}
        >
            {(ref, { open }) => (
                <Button onClick={open} ref={ref}>
                    <Icon svg={moreHorizSvg} />
                </Button>
            )}
        </Menu>
    )

    const editor = (
        <ErrorBoundary fallback={<p>Something went wrong</p>}>
            <EditorView doc={item.local} onChange={onChange} />
        </ErrorBoundary>
    )

    if (isMobile) {
        return (
            <div
                style={{
                    height: "100dvh",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "scroll"
                }}
            >
                <Row justify="space-between">
                    <LinkButton to="/">
                        <Icon svg={arrowBackSvg} />
                    </LinkButton>
                    {menuButton}
                </Row>
                <div style={{ flexGrow: 1 }}>{editor}</div>
                <Row
                    style={{
                        height: 60,
                        flexShrink: 0,
                        padding: "0 10px",
                        overflow: "auto"
                    }}
                    align="center"
                >
                    {categoriesList}
                </Row>
                {selectCategories}
            </div>
        )
    }

    return (
        <div style={{ height: "100dvh", position: "relative" }}>
            <div style={{ position: "absolute", top: 0, right: 0, zIndex: 1 }}>
                {menuButton}
            </div>
            <div style={{ height: "100%", overflow: "scroll" }}>{editor}</div>
            <Row
                style={{
                    background: "var(--color-background)",
                    position: "absolute",
                    bottom: 0,
                    width: "100%",
                    height: 60,
                    padding: "0 40px",
                    boxSizing: "border-box",
                    overflow: "auto"
                }}
                align="center"
            >
                {categoriesList}
            </Row>
            {selectCategories}
        </div>
    )
})

export default DocumentView
