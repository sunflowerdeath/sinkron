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
import { Row, Col } from "oriente"
import { without, isEqual } from "lodash-es"
import * as Automerge from "@automerge/automerge"

import expandLessSvg from "@material-design-icons/svg/outlined/expand_less.svg"
import arrowBackSvg from "@material-design-icons/svg/outlined/arrow_back.svg"
import moreHorizSvg from "@material-design-icons/svg/outlined/more_horiz.svg"

import formatBoldSvg from "@material-design-icons/svg/outlined/format_bold.svg"
import formatItalicSvg from "@material-design-icons/svg/outlined/format_italic.svg"
import formatUnderlinedSvg from "@material-design-icons/svg/outlined/format_underlined.svg"
import formatStrikethroughSvg from "@material-design-icons/svg/outlined/format_strikethrough.svg"

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

interface TitleElement {
    type: "title"
}

interface List {
    type: "list"
}

const Title = (props) => {
    return (
        <div
            style={{
                fontSize: 28,
                lineHeight: "135%",
                marginBottom: 30,
                fontWeight: 650
            }}
            {...props.attributes}
        >
            {props.children}
        </div>
    )
}

const Heading = (props) => {
    return (
        <h3
            style={{
                fontSize: 22.5,
                fontWeight: 650,
                lineHeight: "135%",
                margin: "1rem 0"
            }}
            {...props.attributes}
        >
            {props.children}
        </h3>
    )
}

const renderElement = (props) => {
    switch (props.element.type) {
        case "paragraph":
            return <p {...props.attributes}>{props.children}</p>
        case "title":
            return <Title {...props} />
        case "heading":
            return <Heading {...props} />
        case "code":
            return (
                <pre
                    style={{ padding: 8, border: "2px solid var(--color-elem)" }}
                    {...props.attributes}
                >
                    {props.children}
                </pre>
            )
        case "list":
            return (
                <ul style={{ margin: 0 }} {...props.attributes}>
                    {props.children}
                </ul>
            )
        case "ordered-list":
            return <ol {...props.attributes}>{props.children}</ol>
        case "list-item":
            return (
                <li style={{ margin: ".5rem 0" }} {...props.attributes}>
                    {props.children}
                </li>
            )
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

const createDocumentEditor = (): ReactEditor => {
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

const checkSelectionPoint = (editor: Editor, point: Point) => {
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

    // TODO check how it works with nested blocks and voids

    if (!("text" in node)) {
        return Editor.start(editor, path)
    }

    return { path, offset: Math.min(node.text.length, point.offset) }
}

const Toolbar = () => {
    const editor = useSlate()
    const isMobile = useMedia("(max-width: 1023px)")

    const blockNodes = [
        { type: "heading", label: "Heading" },
        { type: "image", label: "Image" },
        { type: "link", label: "Link" },
        { type: "code", label: "Code" },
        { type: "list", label: "List" },
        { type: "ordered-list", label: "Num.list" },
        {
            type: "check-list",
            label: <span style={{ fontSize: ".87rem" }}>Checklist</span>
        }
    ]
    const textNodes = [
        { type: "b", label: <Icon svg={formatBoldSvg} /> },
        { type: "i", label: <Icon svg={formatItalicSvg} /> },
        { type: "u", label: <Icon svg={formatUnderlinedSvg} /> },
        { type: "s", label: <Icon svg={formatStrikethroughSvg} /> }
    ]

    const blockButtons = blockNodes.map(({ type, label }) => (
        <Button
            style={{
                width: "100%",
                boxShadow: isNodeActive(editor, type)
                    ? "0 0 0 2px #dfdfdf inset"
                    : "none"
            }}
            onClick={(e) => {
                toggleBlock(editor, type)
                // e.preventDefault()
            }}
            size="s"
        >
            {label}
        </Button>
    ))

    const textButtons = textNodes.map(({ type, label }) => (
        <Button
            style={{
                width: isMobile ? "100%" : 60,
                boxShadow: isNodeActive(editor, type)
                    ? "0 0 0 2px #dfdfdf inset"
                    : "none"
            }}
            onClick={(e) => {
                toggleBlock(editor, type)
                // e.preventDefault()
            }}
            size="s"
        >
            {label}
        </Button>
    ))

    if (isMobile) {
        return (
            <Col gap={8} align="normal">
                <div
                    style={{
                        flexGrow: 1,
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fill, minmax(75px, 1fr))",
                        gap: 8
                    }}
                >
                    {blockButtons}
                </div>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 8
                    }}
                >
                    {textButtons}
                </div>
            </Col>
        )
    } else {
        return (
            <Row gap={24} align="space-between" style={{ maxWidth: 800 }}>
                <div
                    style={{
                        flexGrow: 1,
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 90px)",
                        gap: 8
                    }}
                >
                    {blockButtons}
                </div>
                <Row
                    gap={8}
                    wrap={true}
                    style={{ width: 128, flexShrink: 0, alignSelf: "start" }}
                >
                    {textButtons}
                </Row>
            </Row>
        )
    }
}

type EditorViewProps = {
    id: string
    doc: Automerge.Doc<Document>
    onChange: (editor: ReactEditor) => void
    onDelete: () => void
}

const EditorView = observer((props: EditorViewProps) => {
    const { id, doc, onChange, onDelete } = props

    const space = useSpace()

    const forceUpdate = useForceUpdate()
    const editor = useMemo(() => createDocumentEditor(), [])
    const value = useMemo(() => {
        return (fromAutomerge(doc.content) as any).children
    }, [doc])
    useMemo(() => {
        if (!isEqual(editor.children, value)) {
            editor.children = value
            if (editor.selection !== null) {
                const { anchor, focus } = editor.selection
                const selection = {
                    anchor: checkSelectionPoint(editor, anchor),
                    focus: checkSelectionPoint(editor, focus)
                }
                if (!isEqual(editor.selection, selection)) {
                    editor.selection = selection
                }
            }
            forceUpdate()
        }
    }, [value])

    const isMobile = useMedia("(max-width: 1023px)")

    const [showToolbar, setShowToolbar] = useState(false)
    let bottomElem
    if (showToolbar) {
        bottomElem = (
            <div
                style={{
                    padding: isMobile ? 8 : "8px 40px",
                    boxSizing: "border-box",
                    background: "var(--color-background)",
                    borderTop: "2px solid var(--color-elem)"
                }}
            >
                <Toolbar />
            </div>
        )
    } else {
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
                <Button
                    kind="faint"
                    size="s"
                    onClick={() => setShowSelect(true)}
                >
                    Select categories
                </Button>
            )
        }

        bottomElem = (
            <Row
                style={{
                    background: "var(--color-background)",
                    height: 60,
                    padding: isMobile ? "0 10px" : "0 40px",
                    boxSizing: "border-box",
                    overflowX: "auto",
                    flexShrink: 0
                }}
                align="center"
            >
                {categoriesList}
            </Row>
        )
    }

    const menu = () => (
        <>
            <MenuItem>Share</MenuItem>
            <MenuItem>Copy to another space</MenuItem>
            <MenuItem>Publish</MenuItem>
            <MenuItem onSelect={onDelete}>Delete</MenuItem>
        </>
    )

    const menuButton = (
        <Menu
            menu={menu}
            styles={{ list: { background: "var(--color-elem)" } }}
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

    const readOnly = space.space.role === "readonly"
    const editorElem = (
        <ErrorBoundary fallback={<p>Something went wrong</p>}>
            <Editable
                renderElement={renderElement}
                readOnly={readOnly}
                style={{
                    padding: isMobile ? 10 : 40,
                    paddingTop: 20,
                    paddingBottom: 10,
                    outline: "none",
                    flexGrow: 1,
                    maxWidth: 800,
                    boxSizing: "border-box"
                    // overflow: "auto"
                }}
                autoFocus={!isMobile}
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
        </ErrorBoundary>
    )

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

    const topBar = isMobile ? (
        <Row justify="space-between">
            <LinkButton to="/">
                <Icon svg={arrowBackSvg} />
            </LinkButton>
            <Row gap={8}>
                <Button onClick={() => setShowToolbar((v) => !v)}>A</Button>
                {menuButton}
            </Row>
        </Row>
    ) : (
        <Row
            gap={8}
            justify="end"
            style={{ position: "absolute", top: 0, right: 0, zIndex: 1 }}
        >
            <Button onClick={() => setShowToolbar((v) => !v)}>A</Button>
            {menuButton}
        </Row>
    )

    const content = (
        <Col align="stretch" style={{ height: "100dvh", position: "relative" }}>
            {topBar}
            <div style={{ flexGrow: 1, overflow: "auto" }}>{editorElem}</div>
            {bottomElem}
            {selectCategories}
        </Col>
    )

    return (
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
            {content}
        </Slate>
    )
})

interface DocumentViewProps {
    id: string
}

const DocumentView = observer((props: DocumentViewProps) => {
    const { id } = props

    const space = useSpace()
    const [_location, navigate] = useLocation()

    const item = space.collection.items.get(id)
    if (item === undefined || item.local === null) {
        return <Redirect to="/" />
    }

    const onChange = (editor: ReactEditor) => {
        const ops = editor.operations.filter(
            (op) => op.type !== "set_selection"
        )
        if (ops.length > 0) {
            space.collection.change(id, (doc) => {
                applySlateOps(doc.content, ops)
            })
        }
    }

    const onDelete = () => {
        space.collection.delete(id)
        navigate("/")
    }

    return (
        <EditorView
            id={id}
            doc={item.local}
            onChange={onChange}
            onDelete={onDelete}
        />
    )
})

export default DocumentView
