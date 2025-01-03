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
import {
    isNodeActive,
    isMarkActive,
    toggleMark,
    toggleCodeBlock,
    toggleHeading,
    toggleList,
    toggleNumList,
    toggleCheckList
} from "./helpers"
import type { TextMarkType } from "./helpers"

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

    const onClickImage = () => {
        store.documentStore.openImageDialog()
    }

    const onClickLink = () => {
        if (isNodeActive(editor, "link")) {
            store.view = "edit_link"
        } else {
            store.view = "create_link"
        }
    }

    const blockButtons = (
        <>
            <ToolbarButton
                isActive={isNodeActive(editor, "heading")}
                onClick={() => toggleHeading(editor)}
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
                onClick={() => toggleCodeBlock(editor)}
            >
                Code
            </ToolbarButton>
            <ToolbarButton
                isActive={isNodeActive(editor, "list")}
                onClick={() => toggleList(editor)}
            >
                List
            </ToolbarButton>
            <ToolbarButton
                isActive={isNodeActive(editor, "ordered-list")}
                onClick={() => toggleNumList(editor)}
            >
                Num.list
            </ToolbarButton>
            <ToolbarButton
                isActive={isNodeActive(editor, "check-list")}
                onClick={() => toggleCheckList(editor)}
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
            <Col gap={6} align="normal">
                <div
                    style={{
                        flexGrow: 1,
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fill, minmax(75px, 1fr))",
                        gap: 6
                    }}
                >
                    {blockButtons}
                </div>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 6
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

export type ToolbarView = "toolbar" | "create_link" | "edit_link"

export type ToolbarStoreProps = {
    editor: ReactEditor
    documentStore: DocumentViewStore
}

class ToolbarStore {
    editor: ReactEditor
    documentStore: DocumentViewStore

    view: ToolbarView = "toolbar"

    constructor(props: ToolbarStoreProps) {
        this.editor = props.editor
        this.documentStore = props.documentStore
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
    toolbarStore: ToolbarStore
}

const Toolbar = observer((props: ToolbarProps) => {
    const { toolbarStore } = props

    const isMobile = useMedia("(max-width: 1023px)")

    let elem
    if (toolbarStore.view === "toolbar") {
        elem = <ToolbarButtonsView store={toolbarStore} />
    } else if (toolbarStore.view === "create_link") {
        elem = <ToolbarCreateLinkView store={toolbarStore} />
    } else if (toolbarStore.view === "edit_link") {
        elem = <ToolbarEditLinkView store={toolbarStore} />
    }

    const noPadding = isMobile && toolbarStore.view === "toolbar"
    return (
        <div
            style={{
                boxSizing: "border-box",
                background: "var(--color-background)",
                padding: noPadding ? 0 : isMobile ? 8 : "8px 40px",
                borderTop: noPadding ? "none" : "2px solid var(--color-elem)"
            }}
        >
            {elem}
        </div>
    )
})

export { Toolbar, ToolbarStore }
