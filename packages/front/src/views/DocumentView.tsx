import { useState, useCallback, useMemo } from "react"
import { observer } from "mobx-react-lite"
import { useLocation, Redirect, Link } from "wouter"
import { useMedia } from "react-use"
import { createEditor, Node, Transforms, Editor, Point } from "slate"
import { withReact, ReactEditor, Slate, Editable } from "slate-react"
import { Row } from "oriente"
import { without } from "lodash-es"
import * as Automerge from "@automerge/automerge"

window.Editor = Editor
window.Transforms = Transforms

import expandLessSvg from "@material-design-icons/svg/outlined/expand_less.svg"
import arrowBackSvg from "@material-design-icons/svg/outlined/arrow_back.svg"
import moreHorizSvg from "@material-design-icons/svg/outlined/more_horiz.svg"

import { useSpace } from "../store"
import type { Document } from "../entities"
import { fromAutomerge, applySlateOps } from "../slate"
import SelectCategoriesView from "../views/SelectCategoriesView"
import CategoriesList from "../components/CategoriesList"
import { Button, Icon, Menu, MenuItem } from "../ui"

const useForceUpdate = () => {
    const [state, setState] = useState({})
    const forceUpdate = useCallback(() => {
        setState(() => ({}))
    }, [])
    return forceUpdate
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
    }
    return <span {...props.attributes}>{props.children}</span>
}

const createDocumentEditor = (onChange: any): ReactEditor => {
    const editor = withReact(createEditor())
    const { normalizeNode } = editor
    // editor.onChange = onChange
    editor.normalizeNode = (entry) => {
        const [node, path] = entry
        if (path.length === 0) {
            /*if (
                    editor.children.length <= 1 &&
                    Editor.string(editor, [0, 0]) === ''
                ) {
                    const title: TitleElement = {
                        type: 'title',
                        children: [{ text: '' }]
                    }
                    Transforms.insertNodes(editor, title, {
                        at: path.concat(0),
                        select: true
                    })
                }*/
            for (const [child, childPath] of Node.children(editor, path)) {
                const index = childPath[0]
                if (index === 0) {
                    if (child.type !== "title") {
                        Transforms.setNodes(
                            editor,
                            { type: "title" },
                            { at: childPath }
                        )
                    }
                } else {
                    if (child.type === "title") {
                        Transforms.setNodes(
                            editor,
                            { type: "paragraph" },
                            { at: childPath }
                        )
                    }
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
    const value = useMemo(
        () => {
            // 
            return (fromAutomerge(doc.content) as any).children
        },
        [doc]
    )
    useMemo(() => {
        editor.children = value

        // if (editor.selection !== null) {
            // const end = Editor.end(editor, [])
            // const { anchor, focus } = editor.selection
            // const selection = {
                // anchor: Point.isAfter(anchor, end) ? end : anchor,
                // focus: Point.isAfter(focus, end) ? end : focus
            // }
            // editor.selection = selection
        // }

        forceUpdate()
    }, [value])

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
    )
})

interface DocumentViewProps {
    id: string
}

const DocumentView = observer((props: DocumentViewProps) => {
    const { id } = props

    const space = useSpace()
    const [location, navigate] = useLocation()
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
            space.collection.change(id, (doc) =>
                applySlateOps(doc.content, ops)
            )
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

    const editor = <EditorView doc={item.local} onChange={onChange} />

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
                    <Button as={Link} to="/">
                        <Icon svg={arrowBackSvg} />
                    </Button>
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
