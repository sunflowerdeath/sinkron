import { useMemo, useState } from "react"
import { useMedia } from "react-use"
import { observer } from "mobx-react-lite"
import { Node, Range, Transforms, Editor, Element, NodeEntry } from "slate"
import { ReactEditor, useSlate } from "slate-react"
import { makeAutoObservable } from "mobx"
import { Col, Row } from "oriente"

import { LinkElement } from "../../types"

import { useSpace, SpaceStore } from "../../store"
import { Button, Icon, Input } from "../../ui"

import formatBoldSvg from "@material-design-icons/svg/outlined/format_bold.svg"
import formatItalicSvg from "@material-design-icons/svg/outlined/format_italic.svg"
import formatUnderlinedSvg from "@material-design-icons/svg/outlined/format_underlined.svg"
import formatStrikethroughSvg from "@material-design-icons/svg/outlined/format_strikethrough.svg"

import type { BlockType, TextMarkType } from "./helpers"
import { isNodeActive, toggleBlock, isMarkActive, toggleMark } from "./helpers"

interface ToolbarViewProps {
    store: ToolbarStore
}

const openFileDialog = (cb: (files: FileList) => void) => {
    const input = document.createElement("input")
    input.type = "file"
    input.addEventListener("change", () => {
        if (input.files !== null) cb(input.files)
    })
    input.click()
}

const ToolbarButtonsView = observer((props: ToolbarViewProps) => {
    const { store } = props
    const editor = useSlate() as ReactEditor
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
            preventFocusSteal
            onClick={() => {
                if (type === "image") {
                    store.addImage()
                } else if (type === "link") {
                    if (isNodeActive(editor, "link")) {
                        store.view = "edit_link"
                    } else {
                        store.view = "create_link"
                    }
                } else {
                    toggleBlock(editor, type as BlockType)
                }
            }}
            size="s"
        >
            {label}
        </Button>
    ))

    const textButtons = textNodes.map(({ type, label }) => (
        <Button
            key={type}
            preventFocusSteal
            style={{
                width: isMobile ? "100%" : 60,
                boxShadow: isMarkActive(editor, type as TextMarkType)
                    ? "0 0 0 2px #dfdfdf inset"
                    : "none"
            }}
            onClick={() => {
                toggleMark(editor, type as TextMarkType)
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

class ToolbarStore {
    editor: ReactEditor
    view: ToolbarView = "toolbar"
    spaceStore: SpaceStore

    constructor(editor: ReactEditor, spaceStore: SpaceStore) {
        this.editor = editor
        this.spaceStore = spaceStore
        makeAutoObservable(this, { editor: false, spaceStore: false })
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

    addImage() {
        openFileDialog((files) => {
            const { selection } = this.editor
            if (selection) {
                const id = this.spaceStore.upload(files[0])
                const image = { type: "image", id, children: [{ text: "" }] }
                Transforms.insertNodes(this.editor, [image])
            }
        })
    }
}

const Toolbar = observer(() => {
    const editor = useSlate() as ReactEditor
    const spaceStore = useSpace()
    const toolbarStore = useMemo(() => new ToolbarStore(editor, spaceStore), [])

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
