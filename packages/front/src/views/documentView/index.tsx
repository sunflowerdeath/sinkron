import { useState, useCallback, useMemo } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { observer } from "mobx-react-lite"
import { useLocation, Redirect } from "wouter"
import { useMedia } from "react-use"
import {
    ReactEditor,
    Slate,
    Editable,
    RenderElementProps,
    RenderLeafProps
} from "slate-react"
import { Col, Row } from "oriente"
import { isEqual, without } from "lodash-es"
import { Transforms } from "slate"
import { LoroMap } from "loro-crdt"
import { ObservableLoroDoc } from "@sinkron/client/lib/collection"
import { applySlateOps } from "@sinkron/loro-slate"

import expandLessSvg from "@material-design-icons/svg/outlined/expand_less.svg"
import arrowBackSvg from "@material-design-icons/svg/outlined/arrow_back.svg"
import moreHorizSvg from "@material-design-icons/svg/outlined/more_horiz.svg"

import env from "~/env"
import { useSpaceStore, useUserStore } from "~/store"
import { DocumentData } from "~/store/spaceStore"
import { SelectCategoriesView } from "~/views/selectCategoriesView"
import { ShareAndAccessView } from "~/views/shareAndAccessView"
import { PublishView } from "~/views/publishView"
import { CategoriesList } from "~/components/categoriesList"
import {
    Button,
    LinkButton,
    Icon,
    Menu,
    MenuItem,
    useStateToast,
    useDialog
} from "~/ui"
import { copyToClipboard } from "~/utils/copyToClipboard"

import { DocumentViewStore, DocumentStoreContext } from "./store"
import { EditorElement, EditorLeaf } from "./elements"
import { checkSelectionPoint, isNodeActive, toggleMark } from "./helpers"
import { Toolbar } from "./toolbar"
import { CopyView } from "./copyView"

const useForceUpdate = () => {
    const [_state, setState] = useState({})
    const forceUpdate = useCallback(() => {
        setState(() => ({}))
    }, [])
    return forceUpdate
}

type EditorViewProps = {
    id: string
    doc: ObservableLoroDoc
    data: DocumentData
    onChange: (editor: ReactEditor) => void
    onDelete: () => void
}

const EditorView = observer((props: EditorViewProps) => {
    const { id, doc, data, onChange, onDelete } = props

    const isMobile = useMedia("(max-width: 1023px)")
    const userStore = useUserStore()
    const spaceStore = useSpaceStore()
    const toast = useStateToast()
    const documentViewStore = useMemo(
        () => new DocumentViewStore({ spaceStore, toast, id, doc }),
        []
    )
    const editor = documentViewStore.editor
    const value = documentViewStore.value
    const readOnly = spaceStore.space.role === "readonly" || data.isLocked

    const forceUpdate = useForceUpdate()
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

    const onRemoveCategory = (cat: string) => {
        spaceStore.changeDoc(id, (doc) => {
            const root = doc.getMap("root")
            const categories = root.get("categories") as string[]
            root.set("categories", without(categories, cat))
        })
    }

    let bottomElem
    if (documentViewStore.showToolbar) {
        bottomElem = <Toolbar toolbarStore={documentViewStore.toolbarStore} />
    } else {
        let categoriesList
        if (data.categories.length > 0) {
            categoriesList = (
                <Row gap={8} align="center" style={{ width: "100%" }}>
                    <div style={{ overflow: "scroll" }}>
                        <CategoriesList
                            items={data.categories.map(
                                (id) => spaceStore.meta.categories[id]!
                            )}
                            onRemove={onRemoveCategory}
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
                    padding: isMobile ? "0 8px" : "0 40px",
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

    const setIsPinned = (value: boolean) => {
        spaceStore.collection.change(id, (doc) => {
            const root = doc.getMap("root")
            root.set("isPinned", value)
        })
    }

    const copyDialog = useDialog((close) => (
        <CopyView
            docId={id}
            spaceStore={spaceStore}
            spaces={userStore.spaces}
            toast={toast}
            onClose={close}
        />
    ))

    const menu = () => {
        const isLocked = data.isLocked
        const isPinned = data.isPinned
        const isReadonly = spaceStore.space.role === "readonly"

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
                {data.isPublished && (
                    <MenuItem onSelect={open}>Open published version</MenuItem>
                )}
            </>
        )

        const copyLink = () => {
            const link = `${env.linksOrigin}/link/${spaceStore.space.id}/${id}`
            copyToClipboard(link)
        }

        return (
            <>
                {lockItems}
                <MenuItem
                    onSelect={() => setIsPinned(!isPinned)}
                    isDisabled={isReadonly || isLocked}
                >
                    {isPinned ? "Unpin" : "Pin to top"}
                </MenuItem>
                <MenuItem onSelect={copyLink}>Copy link</MenuItem>
                {publishItems}
                {/*<MenuItem onSelect={() => setView("share")}>
                    Share & Access
                </MenuItem>*/}
                <MenuItem onSelect={() => copyDialog.open()}>
                    Make a copy
                </MenuItem>
                <MenuItem
                    onSelect={onDelete}
                    isDisabled={isReadonly || isLocked}
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
                    value={data.categories}
                    readOnly={readOnly}
                    onChange={(value) => {
                        spaceStore.collection.change(id, (doc) => {
                            const root = doc.getMap("root")
                            root.set("categories", value)
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

    const toggleToolbarButton = !readOnly && (
        <Button
            onClick={() => {
                documentViewStore.toggleToolbar()
            }}
        >
            A
        </Button>
    )

    const topBar = isMobile ? (
        <Row justify="space-between">
            <LinkButton to="/">
                <Icon svg={arrowBackSvg} />
            </LinkButton>
            <Row gap={8}>
                {toggleToolbarButton}
                {menuButton}
            </Row>
        </Row>
    ) : (
        <Row
            gap={8}
            justify="end"
            style={{ position: "absolute", top: 0, right: 0, zIndex: 1 }}
        >
            {toggleToolbarButton}
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
            {copyDialog.render()}
        </Col>
    )

    return (
        <DocumentStoreContext.Provider value={documentViewStore}>
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
        </DocumentStoreContext.Provider>
    )
})

interface DocumentViewProps {
    id: string
}

const DocumentView = observer((props: DocumentViewProps) => {
    const { id } = props

    const spaceStore = useSpaceStore()
    const [_location, navigate] = useLocation()

    const item = spaceStore.collection.items.get(id)
    if (
        item === undefined ||
        item.local === null ||
        item.data === undefined ||
        item.data.isMeta
    ) {
        return <Redirect to="/" />
    }

    const onChange = (editor: ReactEditor) => {
        const ops = editor.operations.filter(
            (op) => op.type !== "set_selection"
        )
        if (ops.length > 0) {
            spaceStore.changeDoc(id, (doc) => {
                const content = doc.getMap("root").get("content")
                if (content instanceof LoroMap) {
                    applySlateOps(content, ops)
                }
            })
        }
    }

    const onDelete = () => {
        spaceStore.collection.delete(id)
        navigate("/")
    }

    return (
        <EditorView
            id={id}
            data={item.data}
            doc={item.local}
            onChange={onChange}
            onDelete={onDelete}
        />
    )
})

export { DocumentView }
