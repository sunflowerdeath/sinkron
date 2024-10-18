import { useState, useCallback, useMemo } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { observer } from "mobx-react-lite"
import { useLocation, Redirect } from "wouter"
import { useMedia } from "react-use"
import {
    ReactEditor,
    Slate,
    Editable,
    // useReadOnly,
    RenderElementProps,
    RenderLeafProps
} from "slate-react"
import { Col, Row } from "oriente"
import { without, isEqual } from "lodash-es"
import * as Automerge from "@automerge/automerge"
import { Transforms } from "slate"

import expandLessSvg from "@material-design-icons/svg/outlined/expand_less.svg"
import arrowBackSvg from "@material-design-icons/svg/outlined/arrow_back.svg"
import moreHorizSvg from "@material-design-icons/svg/outlined/more_horiz.svg"

import env from "~/env"
import { useSpace } from "~/store"
import type { Document } from "~/entities"
import { fromAutomerge, applySlateOps } from "~/slate"
import SelectCategoriesView from "~/views/SelectCategoriesView"
import ShareAndAccessView from "~/views/ShareAndAccessView"
import PublishView from "~/views/PublishView"
import CategoriesList from "~/components/CategoriesList"
import { Button, LinkButton, Icon, Menu, MenuItem, useStateToast } from "~/ui"

import { DocumentViewStore } from "./store"
import { EditorElement, EditorLeaf } from "./elements"
import { checkSelectionPoint, isNodeActive, toggleMark } from "./helpers"
import { Toolbar } from "./toolbar"

const useForceUpdate = () => {
    const [_state, setState] = useState({})
    const forceUpdate = useCallback(() => {
        setState(() => ({}))
    }, [])
    return forceUpdate
}

type EditorViewProps = {
    id: string
    doc: Automerge.Doc<Document>
    onChange: (editor: ReactEditor) => void
    onDelete: () => void
}

const EditorView = observer((props: EditorViewProps) => {
    const { id, doc, onChange, onDelete } = props

    const spaceStore = useSpace()

    const toast = useStateToast()
    const documentViewStore = useMemo(
        () => new DocumentViewStore({ spaceStore, toast, id }),
        []
    )
    const editor = documentViewStore.editor

    const readOnly = spaceStore.space.role === "readonly" || doc.isLocked

    const forceUpdate = useForceUpdate()
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
                <Toolbar document={documentViewStore} />
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
                                (id) => spaceStore.meta.categories[id]!
                            )}
                            onRemove={(c) => {
                                spaceStore.changeDoc(id, (doc) => {
                                    doc.categories = without(doc.categories, c)
                                })
                            }}
                            readOnly={readOnly}
                        />
                    </div>
                    <Button size="s" onClick={() => setView("categories")}>
                        <Icon svg={expandLessSvg} />
                    </Button>
                </Row>
            )
        } else {
            categoriesList = (
                <Button
                    kind="faint"
                    size="s"
                    onClick={() => setView("categories")}
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

    const menu = () => {
        const isLocked = doc.isLocked
        const canDelete = spaceStore.space.role !== "readonly"

        const canLock = ["admin", "owner"].includes(spaceStore.space.role)
        const lockItems = (
            <>
                {isLocked && (
                    <>
                        <div style={{ padding: 10 }}>Document is locked</div>
                        <hr />
                    </>
                )}
                {isLocked ? (
                    <MenuItem
                        isDisabled={!canLock}
                        onSelect={() => documentViewStore.unlock()}
                    >
                        Unlock
                    </MenuItem>
                ) : (
                    <MenuItem
                        isDisabled={!canLock}
                        onSelect={() => documentViewStore.lock()}
                    >
                        Lock
                    </MenuItem>
                )}
            </>
        )

        const open = () => {
            const host = env.isProductionEnv
                ? "https://sinkron.xyz"
                : "http://localhost:1337"
            const url = `${host}/posts/${id}`
            window.open(url)
        }

        const canPublish = ["admin", "owner"].includes(spaceStore.space.role)
        const publishItems = (
            <>
                {canPublish && (
                    <MenuItem onSelect={() => setView("publish")}>
                        Publish
                    </MenuItem>
                )}
                {doc.isPublished && (
                    <MenuItem onSelect={open}>Open published version</MenuItem>
                )}
            </>
        )

        return (
            <>
                {lockItems}
                {publishItems}
                {/*<MenuItem onSelect={() => setView("share")}>
                    Share & Access
                </MenuItem>*/}
                {/*<MenuItem isDisabled={true}>Copy link to document</MenuItem>*/}
                {/*<MenuItem isDisabled={true}>Copy to another space</MenuItem>*/}
                <MenuItem
                    onSelect={onDelete}
                    isDisabled={!canDelete || isLocked}
                >
                    Delete
                </MenuItem>
            </>
        )
    }

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

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            if (event.key == "b" && event.ctrlKey) {
                toggleMark(editor, "bold")
                return
            }

            if (event.key == "u" && event.ctrlKey) {
                toggleMark(editor, "underline")
                return
            }

            if (event.key == "i" && event.ctrlKey) {
                toggleMark(editor, "italic")
                return
            }

            if (event.key === "Enter" && isNodeActive(editor, "image")) {
                event.preventDefault()
                Transforms.insertNodes(editor, {
                    type: "paragraph",
                    children: [{ text: "" }]
                })
                return
            }
        },
        [editor]
    )

    const editorElem = (
        <ErrorBoundary fallback={<p>Something went wrong</p>}>
            <Editable
                renderElement={renderElement}
                renderLeaf={renderLeaf}
                readOnly={readOnly}
                onKeyDown={onKeyDown}
                style={{
                    padding: isMobile ? 10 : 40,
                    paddingTop: isMobile ? 80 : 20,
                    paddingBottom: 10,
                    outline: "none",
                    flexGrow: 1,
                    maxWidth: 800,
                    boxSizing: "border-box",
                    overflow: "auto"
                }}
                autoFocus={!isMobile}
            />
        </ErrorBoundary>
    )

    const [view, setView] = useState<
        "share" | "categories" | "publish" | undefined
    >(undefined)
    let viewElem = null
    if (view !== undefined) {
        let content
        if (view === "categories") {
            content = (
                <SelectCategoriesView
                    value={doc.categories}
                    readOnly={readOnly}
                    onChange={(value) => {
                        spaceStore.collection.change(id, (doc) => {
                            doc.categories = value
                        })
                    }}
                    categoryTree={spaceStore.categoryTree}
                    onClose={() => setView(undefined)}
                />
            )
        } else if (view === "share") {
            content = <ShareAndAccessView onClose={() => setView(undefined)} />
        } else if (view === "publish") {
            content = (
                <PublishView onClose={() => setView(undefined)} docId={id} />
            )
        }
        viewElem = (
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    height: env.tauri ? "100vh" : "100dvh",
                    width: "100%",
                    background: "var(--color-background)",
                    overflow: "scroll"
                }}
            >
                {content}
            </div>
        )
    }

    const topBar = isMobile ? (
        <Row justify="space-between">
            <LinkButton to="/">
                <Icon svg={arrowBackSvg} />
            </LinkButton>
            <Row gap={8}>
                <Button
                    onClick={() => setShowToolbar((v) => !v)}
                    preventFocusSteal
                >
                    A
                </Button>
                {menuButton}
            </Row>
        </Row>
    ) : (
        <Row
            gap={8}
            justify="end"
            style={{ position: "absolute", top: 0, right: 0, zIndex: 1 }}
        >
            {!readOnly && (
                <Button onClick={() => setShowToolbar((v) => !v)}>A</Button>
            )}
            {menuButton}
        </Row>
    )

    const content = (
        <Col
            style={{
                position: "relative",
                height: env.tauri ? "100vh" : "100dvh"
            }}
            gap="8"
            align="stretch"
        >
            {editorElem}
            <div style={{ position: "absolute", top: 0, width: "100%" }}>
                {topBar}
            </div>
            {bottomElem}
            {viewElem}
        </Col>
    )

    return (
        <Slate
            initialValue={value}
            editor={editor}
            onChange={() => {
                // Prevent bug firing twice on Android
                if (editor.operations.length === 0) return
                // @ts-expect-error fired
                if (!editor.operations.fired) {
                    onChange?.(editor)
                    // @ts-expect-error fired
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
    if (item === undefined || item.local === null || "meta" in item.local) {
        return <Redirect to="/" />
    }

    const onChange = (editor: ReactEditor) => {
        const ops = editor.operations.filter(
            (op) => op.type !== "set_selection"
        )
        if (ops.length > 0) {
            space.changeDoc(id, (doc) => {
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
