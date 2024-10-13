import { useMemo, useState } from "react"
import { useMedia } from "react-use"
import { observer } from "mobx-react-lite"
import { Node, Range, Transforms, Editor, Element, NodeEntry } from "slate"
import { ReactEditor, useSlate } from "slate-react"
import { makeObservable } from "mobx"
import { Col, Row } from "oriente"

import formatBoldSvg from "@material-design-icons/svg/outlined/format_bold.svg"
import formatItalicSvg from "@material-design-icons/svg/outlined/format_italic.svg"
import formatUnderlinedSvg from "@material-design-icons/svg/outlined/format_underlined.svg"
import formatStrikethroughSvg from "@material-design-icons/svg/outlined/format_strikethrough.svg"

import { LinkElement } from "~/types"
import { Button, Icon, Input } from "~/ui"

import { DocumentViewStore } from "./store"
import type { TextMarkType } from "./helpers"
import { isNodeActive, isMarkActive, toggleMark } from "./helpers"

type ToolbarButtonProps = {
    isActive: boolean
    onClick: () => void
    children: React.ReactNode
    style?: React.CSSProperties
}

const ToolbarButton = (props: ToolbarButtonProps) => {
    const { isActive, onClick, children, style } = props
    return (
        <Button
            style={{
                width: "100%",
                boxShadow: isActive
                    ? "0 0 0 2px var(--color-link) inset"
                    : "none",
                ...style
            }}
            preventFocusSteal
            onClick={onClick}
            size="s"
        >
            {children}
        </Button>
    )
}

interface ToolbarViewProps {
    store: ToolbarStore
}

const ToolbarButtonsView = observer((props: ToolbarViewProps) => {
    const { store } = props
    const editor = useSlate() as ReactEditor
    const isMobile = useMedia("(max-width: 1023px)")

    const textNodes = [
        { type: "bold", label: <Icon svg={formatBoldSvg} /> },
        { type: "italic", label: <Icon svg={formatItalicSvg} /> },
        { type: "underline", label: <Icon svg={formatUnderlinedSvg} /> },
        { type: "strikethrough", label: <Icon svg={formatStrikethroughSvg} /> }
    ]

    const listTypes = ["list", "ordered-list", "check-list"]
    const unwrapList = () => {
        Transforms.unwrapNodes(editor, {
            match: (n) => Element.isElement(n) && listTypes.includes(n.type),
            split: true
        })
    }
    const onClickHeading = () => {
        if (isNodeActive(editor, "heading")) {
            Transforms.setNodes(editor, { type: "paragraph" })
        } else {
            unwrapList()
            Transforms.setNodes(editor, { type: "heading" })
        }
    }
    const onClickImage = () => {
        store.document.openImageDialog()
    }
    const onClickLink = () => {
        if (isNodeActive(editor, "link")) {
            store.view = "edit_link"
        } else {
            store.view = "create_link"
        }
    }
    const onClickCode = () => {
        if (isNodeActive(editor, "code-block")) {
            Transforms.unwrapNodes(editor, {
                match: (n) => Element.isElementType(n, "code-block")
            })
        } else {
            Transforms.setNodes(editor, { type: "code-line" })
            // @ts-expect-error wrap doesn't require full element
            Transforms.wrapNodes(editor, { type: "code-block" })
        }
    }
    const onClickList = () => {
        const isActive = isNodeActive(editor, "list")
        unwrapList()
        if (isActive) {
            Transforms.setNodes(editor, { type: "paragraph" })
        } else {
            Transforms.setNodes(editor, { type: "list-item" })
            // @ts-expect-error wrap doesn't require full element
            Transforms.wrapNodes(editor, { type: "list" })
        }
    }
    const onClickNumList = () => {
        const isActive = isNodeActive(editor, "ordered-list")
        unwrapList()
        if (isActive) {
            Transforms.setNodes(editor, { type: "paragraph" })
        } else {
            Transforms.setNodes(editor, { type: "list-item" })
            // @ts-expect-error wrap doesn't require full element
            Transforms.wrapNodes(editor, { type: "ordered-list" })
        }
    }
    const onClickCheckList = () => {
        const isActive = isNodeActive(editor, "check-list")
        unwrapList()
        if (isActive) {
            Transforms.setNodes(editor, { type: "paragraph" })
        } else {
            Transforms.setNodes(editor, { type: "check-list-item" })
            // @ts-expect-error wrap doesn't require full element
            Transforms.wrapNodes(editor, { type: "check-list" })
        }
    }

    const blockButtons = (
        <>
            <ToolbarButton
                isActive={isNodeActive(editor, "heading")}
                onClick={onClickHeading}
            >
                Heading
            </ToolbarButton>
            <ToolbarButton
                isActive={isNodeActive(editor, "image")}
                onClick={onClickImage}
            >
                Image
            </ToolbarButton>
            <ToolbarButton
                isActive={isNodeActive(editor, "link")}
                onClick={onClickLink}
            >
                Link
            </ToolbarButton>
            <ToolbarButton
                isActive={isNodeActive(editor, "code-block")}
                onClick={onClickCode}
            >
                Code
            </ToolbarButton>
            <ToolbarButton
                isActive={isNodeActive(editor, "list")}
                onClick={onClickList}
            >
                List
            </ToolbarButton>
            <ToolbarButton
                isActive={isNodeActive(editor, "ordered-list")}
                onClick={onClickNumList}
            >
                Num.list
            </ToolbarButton>
            <ToolbarButton
                isActive={isNodeActive(editor, "check-list")}
                onClick={onClickCheckList}
            >
                <span style={{ fontSize: ".87rem" }}>Checklist</span>
            </ToolbarButton>
        </>
    )

    const textButtons = textNodes.map(({ type, label }) => (
        <ToolbarButton
            key={type}
            isActive={isMarkActive(editor, type as TextMarkType)}
            onClick={() => {
                toggleMark(editor, type as TextMarkType)
            }}
            style={{ width: isMobile ? "100%" : 60 }}
        >
            {label}
        </ToolbarButton>
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
})

type LinkProps = { text: string; url: string }

const ToolbarCreateLinkView = observer((props: ToolbarViewProps) => {
    const { store } = props
    const editor = useSlate()

    const selectedText = useMemo(
        () => (editor.selection ? Editor.string(editor, editor.selection) : ""),
        []
    )
    const [text, setText] = useState(selectedText)
    const [url, setUrl] = useState("")
    const isEmpty = text.length === 0 || url.length === 0

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
                <Button
                    size="s"
                    onClick={() => {
                        store.view = "toolbar"
                    }}
                >
                    Cancel
                </Button>
                <Button
                    size="s"
                    onClick={() => store.createLink({ text, url })}
                    isDisabled={isEmpty}
                >
                    Create link
                </Button>
            </div>
        </Col>
    )
})

const ToolbarEditLinkView = observer((props: ToolbarViewProps) => {
    const { store } = props

    const editor = useSlate() as ReactEditor
    const linkNode = useMemo(() => store.getLinkNode(editor), [])
    const [text, setText] = useState(linkNode ? Node.string(linkNode[0]) : "")
    const [url, setUrl] = useState(linkNode ? linkNode[0].url : "")
    const isEmpty = text.length === 0 || url.length === 0

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
                <Button size="s" onClick={() => store.removeLink()}>
                    Remove link
                </Button>
                <Button
                    size="s"
                    onClick={() => {
                        store.updateLink(editor, { text, url })
                    }}
                    isDisabled={isEmpty}
                >
                    Apply
                </Button>
            </div>
        </Col>
    )
})

type ToolbarView = "toolbar" | "create_link" | "edit_link"

type ToolbarStoreProps = {
    editor: ReactEditor
    document: DocumentViewStore
}

class ToolbarStore {
    editor: ReactEditor
    document: DocumentViewStore

    view: ToolbarView = "toolbar"

    constructor(props: ToolbarStoreProps) {
        this.editor = props.editor
        this.document = props.document
        makeObservable(this, { view: true })
    }

    getLinkNode(editor: ReactEditor): NodeEntry<LinkElement> | undefined {
        const { selection } = editor
        if (!selection) return
        const nodes = Array.from(
            Editor.nodes(editor, {
                match: (n) => Element.isElementType(n, "link")
            })
        )
        return nodes[0] as NodeEntry<LinkElement>
    }

    createLink({ text, url }: LinkProps) {
        const { selection } = this.editor
        if (selection) {
            const isCollapsed = Range.isCollapsed(selection)
            const link: LinkElement = {
                type: "link",
                url,
                children: isCollapsed ? [{ text }] : []
            }
            if (isCollapsed) {
                Transforms.insertNodes(this.editor, [link, { text: " " }])
            } else {
                Transforms.wrapNodes(this.editor, link, { split: true })
                Transforms.collapse(this.editor, { edge: "end" })
            }
        }
        this.view = "toolbar"
    }

    updateLink(editor: ReactEditor, { text, url }: LinkProps) {
        const linkNode = this.getLinkNode(editor)
        if (linkNode) {
            const [_link, at] = linkNode
            Transforms.setNodes(editor, { url }, { at })
            Transforms.insertText(editor, text, { at })
        }
        this.view = "toolbar"
    }

    removeLink() {
        const { selection } = this.editor
        if (selection) {
            const nodes = Array.from(
                Editor.nodes(this.editor, {
                    match: (n) => Element.isElementType(n, "link")
                })
            )
            if (nodes.length > 0) {
                const [_link, at] = nodes[0]
                Transforms.unwrapNodes(this.editor, { at })
            }
        }
        this.view = "toolbar"
    }
}

type ToolbarProps = {
    document: DocumentViewStore
}

const Toolbar = observer((props: ToolbarProps) => {
    const { document } = props

    const editor = useSlate() as ReactEditor
    const toolbarStore = useMemo(
        () =>
            new ToolbarStore({
                editor,
                document
            }),
        []
    )

    if (toolbarStore.view === "toolbar") {
        return <ToolbarButtonsView store={toolbarStore} />
    } else if (toolbarStore.view === "create_link") {
        return <ToolbarCreateLinkView store={toolbarStore} />
    } else if (toolbarStore.view === "edit_link") {
        return <ToolbarEditLinkView store={toolbarStore} />
    }
    return null
})

export { Toolbar }
