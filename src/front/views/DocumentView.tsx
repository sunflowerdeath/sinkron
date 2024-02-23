import { useState, useCallback, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { useLocation, Redirect, Link } from 'wouter'
import { useMedia } from 'react-use'
import { createEditor, Node, Transforms } from 'slate'
import { withReact, ReactEditor, Slate, Editable } from 'slate-react'
import { Col, Row } from 'oriente'
import { without } from 'lodash-es'

import expandLessSvg from '@material-design-icons/svg/outlined/expand_less.svg'
import arrowBackSvg from '@material-design-icons/svg/outlined/arrow_back.svg'
import moreHorizSvg from '@material-design-icons/svg/outlined/more_horiz.svg'
import closeSvg from '@material-design-icons/svg/outlined/close.svg'

import { fromAutomerge, applySlateOps } from '../../slate'

import SelectCategoriesView from '../views/SelectCategoriesView'
import CategoriesList from '../components/CategoriesList'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { Menu, MenuItem } from '../ui/menu'
import { useStore } from '../store'

const useForceUpdate = () => {
    const [state, setState] = useState({})
    const forceUpdate = useCallback(() => {
        setState(() => ({}))
    }, [])
    return forceUpdate
}

const renderElement = (props) => {
    switch (props.element.type) {
        case 'paragraph':
            return <p {...props.attributes}>{props.children}</p>
        case 'title':
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

const createDocumentEditor = (): ReactEditor => {
    const editor = withReact(createEditor())
    const { normalizeNode } = editor
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
                    if (child.type !== 'title') {
                        Transforms.setNodes(
                            editor,
                            { type: 'title' },
                            { at: childPath }
                        )
                    }
                } else {
                    if (child.type === 'title') {
                        Transforms.setNodes(
                            editor,
                            { type: 'paragraph' },
                            { at: childPath }
                        )
                    }
                }
            }
        }
        normalizeNode(entry)
    }
    return editor
}

interface EditorViewProps {
    doc: Automerge.Doc<Document>
    onChange: (editor: ReactEditor) => void
}

const EditorView = observer((props: EditorViewProps) => {
    const spaceStore = useStore().spaceStore!
    const { doc, onChange } = props

    const isMobile = useMedia('(max-width: 1023px)')

    const [location, navigate] = useLocation()
    const forceUpdate = useForceUpdate()

    const editor = useMemo(() => createDocumentEditor(), [])
    const value = useMemo(
        () => (fromAutomerge(doc.content) as any).children,
        [doc]
    )
    useMemo(() => {
        editor.children = value
        forceUpdate()
    }, [value])

    return (
        <Slate
            initialValue={value}
            editor={editor}
            onChange={() => onChange?.(editor)}
        >
            <Editable
                renderElement={renderElement}
                style={{
                    padding: 10,
                    paddingTop: 30,
                    outline: 'none',
                    flexGrow: 1,
                    overflow: 'auto'
                }}
                autoFocus
                placeholder="Empty document"
                renderPlaceholder={({ children, attributes }) => {
                    return (
                        <div
                            {...attributes}
                            style={{
                                opacity: 0.4,
                                position: 'absolute',
                                top: 18,
                                left: 40,
                                pointerEvents: 'none',
                                userSelect: 'none'
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
    const store = useStore()
    const space = store.spaceStore!

    const [location, navigate] = useLocation()
    const isMobile = useMedia('(max-width: 1023px)')

    const item = space.collection.items.get(id)
    if (item === undefined || item.local === null) {
        return <Redirect to="/" />
    }

    const doc = item.local

    const onChange = (editor: ReactEditor) => {
        const ops = editor.operations.filter(
            (op) => op.type !== 'set_selection'
        )
        if (ops.length > 0) {
            space.collection.change(id, (doc) =>
                applySlateOps(doc.content, ops)
            )
        }
    }

    const onDelete = () => {
        space.collection.delete(id)
        navigate('/')
    }

    const menu = () => {
        return (
            <Col gap={20}>
                <Col style={{ padding: 8 }} gap={8}>
                    <div>Status: Synchronized</div>
                    <div>Created: 1 sep 10:27</div>
                    <div>Last modified: 1 sep 10:27</div>
                </Col>
                <div style={{ alignSelf: 'stretch' }}>
                    <MenuItem>Pin to top</MenuItem>
                    <MenuItem>Share</MenuItem>
                    <MenuItem onSelect={onDelete}>Delete</MenuItem>
                </div>
            </Col>
        )
    }

    let categoriesList
    if (doc.categories.length > 0) {
        categoriesList = (
            <Row gap={8} align="center">
                <CategoriesList
                    items={doc.categories.map((id) => ({
                        id,
                        name: space.meta.categories.find((c) => c.id === id)!
                            .name
                    }))}
                    onRemove={(c) => {
                        space.collection.change(id, (doc) => {
                            doc.categories = without(doc.categories, c)
                        })
                    }}
                />
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
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100vh',
                    width: isMobile ? '100%' : 480,
                    background: '#333',
                    borderRight: '2px solid #555'
                }}
            >
                <SelectCategoriesView
                    value={doc.categories}
                    onChange={(value) => {
                        space.collection.change(id, (doc) => {
                            doc.categories = value
                        })
                    }}
                    categories={space.categories}
                />
                <Button
                    onClick={() => setShowSelect(false)}
                    style={{ position: 'absolute', top: 0, right: 0 }}
                >
                    <Icon svg={closeSvg} />
                </Button>
            </div>
        )
    }

    return (
        <div
            style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                height: '100vh'
            }}
        >
            <Row justify="space-between">
                {isMobile && (
                    <Button as={Link} to="/">
                        <Icon svg={arrowBackSvg} />
                    </Button>
                )}
                <Menu
                    menu={menu}
                    styles={{ list: { background: '#555' } }}
                    placement={{ padding: 0, offset: 8 }}
                    autoSelectFirstItem={false}
                >
                    {(ref, { open }) => (
                        <Button onClick={open} ref={ref}>
                            <Icon svg={moreHorizSvg} />
                        </Button>
                    )}
                </Menu>
            </Row>
            <EditorView doc={item.local} onChange={onChange} />
            {selectCategories}
            <Row style={{ height: 60, paddingLeft: 40 }} align="center">
                {categoriesList}
            </Row>
        </div>
    )
})

export default DocumentView
