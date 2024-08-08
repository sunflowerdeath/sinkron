import { useState, useCallback, useMemo } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { observer } from "mobx-react-lite"
import { useLocation, Redirect } from "wouter"
import { useMedia } from "react-use"
import {
    createEditor,
    Node,
    Range,
    Transforms,
    Editor,
    Point,
    Path,
    Element,
    Text
} from "slate"
import {
    useSlate,
    withReact,
    ReactEditor,
    Slate,
    Editable,
    useSlateStatic,
    // useReadOnly,
    RenderElementProps,
    RenderLeafProps
} from "slate-react"
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

import checkBox from "@material-design-icons/svg/outlined/check_box.svg"
import checkBoxOutline from "@material-design-icons/svg/outlined/check_box_outline_blank.svg"

import { useSpace } from "../store"
import type { Document } from "../entities"
import { fromAutomerge, applySlateOps } from "../slate"
import SelectCategoriesView from "../views/SelectCategoriesView"
import CategoriesList from "../components/CategoriesList"
import { Button, LinkButton, Icon, Menu, MenuItem, Input } from "../ui"

const useForceUpdate = () => {
    const [_state, setState] = useState({})
    const forceUpdate = useCallback(() => {
        setState(() => ({}))
    }, [])
    return forceUpdate
}

type TextElement = {
    text: string
    bold?: boolean
    italic?: boolean
    underline?: boolean
    strikethrough?: boolean
}

type LinkElement = {
    type: "link"
    url: string
    children: TextElement[]
}

type InlineElement = TextElement | LinkElement

type TitleElement = {
    type: "title"
    children: InlineElement[]
}

type HeadingElement = {
    type: "heading"
    children: InlineElement[]
}

type ParagraphElement = {
    type: "paragraph"
    children: InlineElement[]
}

type ListItemElement = {
    type: "list-item"
    children: InlineElement[]
}

type CheckListItemElement = {
    type: "check-list-item"
    isChecked: boolean
    children: InlineElement[]
}

type ListElement = {
    type: "list"
    children: ListItemElement[]
}

type CheckListElement = {
    type: "check-list"
    children: CheckListItemElement[]
}

type OrderedListElement = {
    type: "ordered-list"
    children: ListItemElement[]
}

type CodeElement = {
    type: "code"
    children: string
}

type CustomElement =
    | TitleElement
    | HeadingElement
    | ParagraphElement
    | ListItemElement
    | CheckListItemElement
    | ListElement
    | CheckListElement
    | OrderedListElement
    | CodeElement
    | LinkElement

declare module "slate" {
    interface CustomTypes {
        Element: CustomElement
        Text: TextElement
    }
}

type CustomRenderElementProps<T> = Omit<RenderElementProps, "element"> & {
    element: T
}

const Title = (props: CustomRenderElementProps<TitleElement>) => {
    const { element } = props
    const editor = useSlateStatic()
    const placeholder = Editor.isEmpty(editor, element) && (
        <div
            style={{
                opacity: 0.5,
                position: "absolute",
                top: 0,
                left: 0,
                userSelect: "none",
                pointerEvents: "none"
            }}
            contentEditable={false}
        >
            Title
        </div>
    )
    return (
        <div
            style={{
                fontSize: 28,
                lineHeight: "135%",
                marginBottom: 30,
                fontWeight: 650,
                position: "relative"
            }}
            {...props.attributes}
        >
            {props.children}
            {placeholder}
        </div>
    )
}

const Heading = (props: CustomRenderElementProps<HeadingElement>) => {
    return (
        <h3
            style={{
                fontSize: 22.5,
                fontWeight: 650,
                lineHeight: "135%",
                margin: "2rem 0 1rem"
            }}
            {...props.attributes}
        >
            {props.children}
        </h3>
    )
}

const Link = (props: CustomRenderElementProps<LinkElement>) => {
    return (
        <span style={{ color: "var(--color-link)" }} {...props.attributes}>
            {props.children}
        </span>
    )
}

const CheckListItem = (
    props: CustomRenderElementProps<CheckListItemElement>
) => {
    const { attributes, children, element } = props
    const editor = useSlateStatic() as ReactEditor
    // const readOnly = useReadOnly()

    const toggle = () => {
        const path = ReactEditor.findPath(editor, element)
        const newProps = { isChecked: !element.isChecked }
        Transforms.setNodes(editor, newProps, { at: path })
    }

    return (
        <li
            style={{
                margin: ".25rem 0",
                listStyleType: "none",
                display: "flex",
                alignItems: "center",
                gap: 4
            }}
            {...attributes}
        >
            <div contentEditable={false}>
                <Button size="s" onClick={toggle} kind="transparent">
                    <Icon
                        svg={element.isChecked ? checkBox : checkBoxOutline}
                    />
                </Button>
            </div>
            {children}
        </li>
    )
}

const EditorElement = (props: RenderElementProps) => {
    switch (props.element.type) {
        case "paragraph":
            return <p {...props.attributes}>{props.children}</p>
        case "title":
            return <Title {...props} />
        case "heading":
            return <Heading {...props} />
        case "link":
            return <Link {...props} />
        case "code":
            return (
                <pre
                    style={{
                        padding: 8,
                        border: "2px solid var(--color-elem)"
                    }}
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
        case "check-list-item":
            return <CheckListItem {...props} />
    }
    return <span {...props.attributes}>{props.children}</span>
}

type CustomRenderLeafProps = RenderLeafProps & { leaf: TextElement }

const EditorLeaf = (props: CustomRenderLeafProps) => {
    const { attributes, leaf } = props

    let children = props.children
    if (leaf.bold) {
        children = <strong style={{ fontWeight: 800 }}>{children}</strong>
    }

    if (leaf.italic) {
        children = <em>{children}</em>
    }

    if (leaf.underline) {
        children = <u>{children}</u>
    }

    if (leaf.strikethrough) {
        children = (
            <span style={{ textDecoration: "line-through" }}>{children}</span>
        )
    }

    return <span {...attributes}>{children}</span>
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
            const itemType =
                type === "check-list" ? "check-list-item" : "list-item"
            Transforms.setNodes(editor, { type: itemType })
            Transforms.wrapNodes(editor, { type })
        } else {
            Transforms.setNodes(editor, { type })
        }
    }
}

type TextMark = "bold" | "italic" | "underline" | "strikethrough"

const isMarkActive = (editor: ReactEditor, format: TextMark) => {
    const marks = Editor.marks(editor)
    return marks ? marks[format] === true : false
}

const toggleMark = (editor: ReactEditor, format: TextMark) => {
    const isActive = isMarkActive(editor, format)
    if (isActive) {
        Editor.removeMark(editor, format)
    } else {
        Editor.addMark(editor, format, true)
    }
}

const isAtEndOfNode = (editor: Editor, type: string): Element | undefined => {
    const { selection } = editor
    if (!selection || !Range.isCollapsed(selection)) return
    const [res] = Editor.nodes(editor, {
        match: (node) =>
            !Editor.isEditor(node) &&
            Element.isElement(node) &&
            node.type === type
    })
    if (!res) return
    const [node, path] = res
    if (!Element.isElement(node)) return
    const end = Editor.end(editor, path)
    return Point.equals(selection.anchor, end) ? node : undefined
}

const createDocumentEditor = (): ReactEditor => {
    const editor = withReact(createEditor())
    const { normalizeNode, insertBreak, deleteBackward } = editor

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
                toggleBlock(editor, "list")
                return
            }
            if (isNodeActive(editor, "ordered-list")) {
                toggleBlock(editor, "ordered-list")
                return
            }
        }

        const checkListItem = isAtEndOfNode(editor, "check-list-item")
        if (checkListItem && Editor.isEmpty(editor, checkListItem)) {
            toggleBlock(editor, "check-list")
            return
        }

        insertBreak()
    }

    editor.deleteBackward = (unit) => {
        if (unit === "character") {
            const list = isAtEndOfNode(editor, "list")
            if (list) {
                const listItem = isAtEndOfNode(editor, "list-item")
                if (listItem && Editor.isEmpty(editor, listItem)) {
                    toggleBlock(editor, "list")
                    return
                }
            }

            const orderedList = isAtEndOfNode(editor, "ordered-list")
            if (orderedList) {
                const listItem = isAtEndOfNode(editor, "list-item")
                if (listItem && Editor.isEmpty(editor, listItem)) {
                    toggleBlock(editor, "ordered-list")
                    return
                }
            }

            const checkList = isAtEndOfNode(editor, "check-list")
            if (checkList) {
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

    editor.normalizeNode = (entry) => {
        const [node, path] = entry
        if (path.length === 0) {
            for (const [child, childPath] of Node.children(editor, path)) {
                const index = childPath[0]
                if (index === 0) {
                    if ('type' in child && child.type !== "title") {
                        Transforms.setNodes(
                            editor,
                            { type: "title" },
                            { at: childPath }
                        )
                        return
                    }
                } else {
                    if ('type' in child && child.type === "title") {
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

        const isList = Element.isElement(node) && node.type === "list"
        const isOrderedList =
            Element.isElement(node) && node.type === "ordered-list"
        const isCheckList =
            Element.isElement(node) && node.type === "check-list"
        if (isOrderedList || isList || isCheckList) {
            const itemType =
                isList || isOrderedList ? "list-item" : "check-list-item"
            for (const [child, childPath] of Node.children(editor, path)) {
                if (Text.isText(child)) {
                    Transforms.wrapNodes(
                        editor,
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
    window.editor = editor
    return editor
}

const ToolbarButtons = (props) => {
    const { onChangeView } = props

    const editor  = useSlate() as ReactEditor
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
        { type: "bold", label: <Icon svg={formatBoldSvg} /> },
        { type: "italic", label: <Icon svg={formatItalicSvg} /> },
        { type: "underline", label: <Icon svg={formatUnderlinedSvg} /> },
        { type: "strikethrough", label: <Icon svg={formatStrikethroughSvg} /> }
    ]

    const blockButtons = blockNodes.map(({ type, label }) => (
        <Button
            key={type}
            style={{
                width: "100%",
                boxShadow: isNodeActive(editor, type)
                    ? "0 0 0 2px #dfdfdf inset"
                    : "none"
            }}
            onClick={
                (/*e*/) => {
                    if (type === "link") {
                        onChangeView("create_link")
                    } else {
                        toggleBlock(editor, type)
                    }
                    // e.preventDefault()
                }
            }
            size="s"
        >
            {label}
        </Button>
    ))

    const textButtons = textNodes.map(({ type, label }) => (
        <Button
            key={type}
            style={{
                width: isMobile ? "100%" : 60,
                boxShadow: isMarkActive(editor, type)
                    ? "0 0 0 2px #dfdfdf inset"
                    : "none"
            }}
            onClick={
                (/*e*/) => {
                    toggleMark(editor, type)
                    // e.preventDefault()
                }
            }
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

type LinkProps = { text: string; url: string }

interface ToolbarCreateLinkProps {
    onCancel: () => void
    onCreate: (link: LinkProps) => void
}

const ToolbarCreateLink = (props: ToolbarCreateLinkProps) => {
    const { onCancel, onCreate } = props
    const [text, setText] = useState("")
    const [url, setUrl] = useState("")
    return (
        <Col style={{ maxWidth: 400 }} gap={8} align="stretch">
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "60px 1fr",
                    gap: 8,
                    alignItems: "center"
                }}
            >
                <div style={{ display: "flex", justifyContent: "center" }}>
                    Url
                </div>
                <Input height="s" value={url} onChange={setUrl} />
            </div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "60px 1fr",
                    gap: 8,
                    alignItems: "center"
                }}
            >
                <div style={{ display: "flex", justifyContent: "center" }}>
                    Text
                </div>
                <Input height="s" value={text} onChange={setText} />
            </div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8
                }}
            >
                <Button size="s" onClick={onCancel}>
                    Cancel
                </Button>
                <Button size="s" onClick={() => onCreate({ text, url })}>
                    Create link
                </Button>
            </div>
        </Col>
    )
}

const ToolbarEditLink = () => {
    return (
        <Col style={{ maxWidth: 800 }}>
            Url:
            <input />
            Text:
            <input />
            <Row gap={10}>
                <Button>Remove link</Button>
                <Button>Done</Button>
            </Row>
        </Col>
    )
}

type ToolbarView = "toolbar" | "create_link" | "edit_link"

const Toolbar = () => {
    const [view, setView] = useState<ToolbarView>("toolbar")

    const editor = useSlate()

    const createLink = ({ text, url }: LinkProps) => {
        if (editor.selection) {
            const { selection } = editor
            const isCollapsed = Range.isCollapsed(selection)
            const link : LinkElement = {
                type: "link",
                url,
                children: isCollapsed ? [{ text }] : []
            }
            if (isCollapsed) {
                Transforms.insertNodes(editor, link)
            } else {
                Transforms.wrapNodes(editor, link, { split: true })
                Transforms.collapse(editor, { edge: "end" })
            }
        }
        setView("toolbar")
    }

    if (view === "toolbar") {
        return <ToolbarButtons onChangeView={setView} />
    } else if (view === "create_link") {
        return (
            <ToolbarCreateLink
                onCancel={() => setView("toolbar")}
                onCreate={createLink}
            />
        )
    } else if (view === "edit_link") {
        return <ToolbarEditLink />
    }
    return null
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

type EditorViewProps = {
    id: string
    doc: Automerge.Doc<Document>
    onChange: (editor: ReactEditor) => void
    onDelete: () => void
}

const EditorView = observer((props: EditorViewProps) => {
    const { id, doc, onChange, onDelete } = props

    const space = useSpace()
    const canDelete = space.space.role !== "readonly"

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

    const renderElement = useCallback(
        (props: RenderElementProps) => <EditorElement {...props} />,
        []
    )
    const renderLeaf = useCallback(
        (props: RenderLeafProps) => <EditorLeaf {...props} />,
        []
    )

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
            <MenuItem isDisabled={true}>Share</MenuItem>
            <MenuItem isDisabled={true}>Copy to another space</MenuItem>
            <MenuItem isDisabled={true}>Publish</MenuItem>
            <MenuItem onSelect={onDelete} isDisabled={!canDelete}>
                Delete
            </MenuItem>
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
                renderLeaf={renderLeaf}
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
                // placeholder="Empty document"
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
                if (editor.operations.length === 0) return
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
