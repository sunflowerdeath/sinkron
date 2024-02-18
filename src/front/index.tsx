import { useState, useMemo, useEffect, useCallback, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useGetSet } from 'react-use'
import {
    makeAutoObservable,
    makeObservable,
    observable,
    ObservableMap
} from 'mobx'
import { observer, Observer } from 'mobx-react-lite'
import { fromPromise, IPromiseBasedObservable } from 'mobx-utils'
import * as Automerge from '@automerge/automerge'
import {
    createEditor,
    Editor,
    Element,
    Text,
    Range,
    Path,
    Transforms,
    Operation,
    Node
} from 'slate'
import { Slate, Editable, withReact } from 'slate-react'
import {
    Router,
    Route,
    Switch,
    Redirect,
    useLocation,
    useRoute,
    Link
} from 'wouter'
import { defaults } from 'lodash'

import {
    Collection,
    Item,
    ItemState,
    WebsocketTransport,
    IndexedDbCollectionStore
} from '../sinkron/client'
import { ConnectionStatus } from '../sinkron/client'
import {
    fromAutomerge,
    toAutomerge,
    applySlateOps,
    AutomergeNode
} from '../slate'
import { Result, ResultType } from '../utils/result'

import {
    OrienteProvider,
    Col,
    Row,
    useTaply,
    TapState,
    useStyles,
    StyleProps,
    StyleMap,
    omitStyleProps,
    mergeRefs,
    Modal,
    useModal
} from 'oriente'

import notificationsSvg from '@material-design-icons/svg/outlined/notifications.svg'
import addSvg from '@material-design-icons/svg/outlined/add.svg'
import moreHorizSvg from '@material-design-icons/svg/outlined/more_horiz.svg'

import { fetchJson, FetchError } from './fetchJson'

import { Store, useStore, StoreContext } from './store'

import { Avatar } from './ui/avatar'
import { Button } from './ui/button'
import { Heading } from './ui/heading'
import { Input } from './ui/input'
import { Menu, MenuItem } from './ui/menu'
import ButtonsGrid from './ui/ButtonsGrid'
import { Icon } from './ui/icon'
import Container from './ui/Container'

import CategoriesView from './views/CategoriesView'
import CreateSpaceView from './views/CreateSpaceView'
import SpaceMembersView from './views/SpaceMembersView'
import SwitchSpaceView from './views/SwitchSpaceView'

const useForceUpdate = () => {
    const [state, setState] = useState({})
    const forceUpdate = useCallback(() => {
        setState(() => ({}))
    }, [])
    return forceUpdate
}

const makeInitial = () => ({
    content: toAutomerge({
        children: [
            {
                type: 'paragraph',
                children: [{ text: '' }]
            }
        ]
    }),
    num: 0
})

const renderElement = (props) => {
    switch (props.element.type) {
        case 'paragraph':
            return <p {...props.attributes}>{props.children}</p>
    }
    return <span {...props.attributes}>{props.children}</span>
}

interface Document {
    content: AutomergeNode
}

interface DocumentListItemData {
    id: string
    item: Item<Document>
    title: string
    subtitle: string | null
}

interface DocumentViewProps {
    doc: Automerge.Doc<Document>
    onChange: (editor: Editor) => void
    onDelete: () => void
}

const DocumentView = observer((props: DocumentViewProps) => {
    const { doc, onChange, onDelete } = props

    const value = useMemo(
        () => (fromAutomerge(doc.content) as any).children,
        [doc]
    )

    const editor = useMemo(() => {
        const editor = withReact(createEditor())
        return editor
    }, [])

    const forceUpdate = useForceUpdate()

    useMemo(() => {
        editor.children = value
        forceUpdate()
    }, [value])

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

    return (
        <div
            style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                height: '100%'
            }}
        >
            <Slate
                initialValue={value}
                editor={editor}
                onChange={() => onChange?.(editor)}
            >
                <Editable
                    renderElement={renderElement}
                    style={{ padding: '16px 40px', outline: 'none' }}
                />
            </Slate>
            <div style={{ position: 'absolute', top: 0, right: 0 }}>
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
            </div>
        </div>
    )
})

interface DocumentRouteProps {
    id: string
}

const DocumentRoute = observer((props: DocumentRouteProps) => {
    const { id } = props
    const store = useStore()
    const space = store.spaceStore!

    const [location, navigate] = useLocation()

    const item = space.collection.items.get(id)
    if (item === undefined || item.local === null) {
        return <Redirect to="/" />
    }

    const onChange = (editor: Editor) => {
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

    return (
        <DocumentView
            doc={item.local}
            onChange={onChange}
            onDelete={onDelete}
        />
    )
})

interface DocumentListItemProps {
    data: DocumentListItemData
    isSelected: boolean
    onSelect: () => void
}

const DocumentListItem = observer((props: DocumentListItemProps) => {
    const { data, onSelect, isSelected } = props

    return (
        <Row
            style={{
                height: 60,
                padding: 8,
                borderBottom: '2px solid #555',
                background: isSelected ? '#555' : 'transparent',
                gap: 12,
                cursor: 'pointer'
            }}
            onClick={onSelect}
            align="center"
        >
            <Col gap={4} style={{ flexGrow: 1, overflow: 'hidden' }}>
                <div>
                    {data.title ?? (
                        <span style={{ opacity: 0.5 }}>Empty document</span>
                    )}
                </div>
                {data.subtitle && (
                    <div
                        style={{
                            opacity: '.5',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            maxWidth: '100%'
                        }}
                    >
                        {data.subtitle}
                    </div>
                )}
            </Col>
            <div>
                {data.item.state !== ItemState.Synchronized ? '...' : null}
            </div>
        </Row>
    )
})

const DocumentList = observer(() => {
    const store = useStore()
    const space = store.spaceStore!

    const [location, navigate] = useLocation()
    const [match, params] = useRoute('/documents/:id')
    const selectedId = match ? params.id : undefined

    let content
    if (space.list.map.size > 0) {
        content = space.sortedList.map((item) => (
            <DocumentListItem
                key={item.id}
                data={item}
                isSelected={selectedId === item.id}
                onSelect={() => navigate(`/documents/${item.id}`)}
            />
        ))
    } else {
        content = (
            <div
                style={{
                    opacity: 0.5,
                    padding: '24px 8px',
                    display: 'flex',
                    justifyContent: 'center'
                }}
            >
                No documents
            </div>
        )
    }

    return <div style={{ flexGrow: 1, overflow: 'auto' }}>{content}</div>
})

const SettingsView = observer(() => {
    return <div></div>
})

const modalStyles: StyleMap = {
    window: {
        background: 'var(--color-background)',
        padding: 20
    },
    container: {
        paddingTop: 40
    }
}

const StyledModal = (props: React.ComponentProps<typeof Modal>) => {
    return <Modal styles={[modalStyles, props.styles]} {...props} />
}

const AccountView = observer(() => {
    const store = useStore()

    const leaveModal = useModal({
        Component: StyledModal,
        width: 440,
        isCentered: true,
        children: (close) => {
            return (
                <Col gap={20}>
                    Are you sure you want to leave space "name"?
                    <ButtonsGrid>
                        <Button onClick={close}>Cancel</Button>
                        <Button>Leave</Button>
                    </ButtonsGrid>
                </Col>
            )
        }
    })

    const deleteModal = useModal({
        Component: StyledModal,
        width: 440,
        isCentered: true,
        children: (close) => {
            return (
                <Col gap={20}>
                    Are you sure you want to delete space "name"?
                    <ButtonsGrid>
                        <Button onClick={close}>Cancel</Button>
                        <Button>DELETE</Button>
                    </ButtonsGrid>
                </Col>
            )
        }
    })

    const isOwner = store.user!.id === store.spaceE!.owner.id

    const roleText = isOwner ? 'Owner' : store.spaceE!.role

    return (
        <Container title="Account and spaces">
            <Col gap={16}>
                <Heading>Account</Heading>
                <Row gap={8} align="center">
                    <Avatar name={store.user!.name} />
                    <div>{store.user!.name}</div>
                </Row>
                <ButtonsGrid>
                    <Button>Account settings</Button>
                    <Button onClick={() => store.logout()}>Logout</Button>
                </ButtonsGrid>
            </Col>
            <Col gap={16}>
                <Heading>Space</Heading>
                <Row gap={8}>
                    <Avatar name={store.spaceE!.name} />
                    <Col>
                        <div>{store.spaceE!.name}</div>
                        <div style={{ opacity: '.6' }}>
                            {store.spaceE!.membersCount} member &ndash;{' '}
                            {roleText}
                        </div>
                    </Col>
                </Row>
                <ButtonsGrid>
                    <Button>Invite member</Button>
                    <Button as={Link} to="/space/members">
                        Members list
                    </Button>
                    <Button>Space settings</Button>
                    {isOwner ? (
                        <Button onClick={() => deleteModal.open()}>
                            Delete space
                        </Button>
                    ) : (
                        <Button onClick={() => leaveModal.open()}>
                            Leave space
                        </Button>
                    )}
                </ButtonsGrid>
            </Col>
            <ButtonsGrid>
                <Button as={Link} to="/switch-space">
                    Switch space
                </Button>
                <Button as={Link} to="/create-space">
                    Create new space
                </Button>
            </ButtonsGrid>
            {leaveModal.render()}
            {deleteModal.render()}
        </Container>
    )
})


const NotificationsView = observer(() => {
    const store = useStore()
    return <Container title="Notifications">No notifications</Container>
})

const SpaceView = observer(() => {
    const store = useStore()
    const space = store.spaceStore!

    const [location, navigate] = useLocation()

    const createDocument = () => {
        const id = space.collection.create(makeInitial())
        navigate(`/documents/${id}`)
    }

    const spaceBar = (
        <Row gap={8}>
            <Button
                style={{ justifyContent: 'start', flexGrow: 1 }}
                as={Link}
                to="/account"
            >
                <Row gap={8} align="center">
                    <Avatar name={space.space.name} />
                    <div style={{ flexGrow: 1 }}>{space.space.name}</div>
                </Row>
            </Button>
            <Button as={Link} to="/notifications">
                <Icon svg={notificationsSvg} />
            </Button>
        </Row>
    )

    const notesBar = (
        <Row gap={8}>
            <Button
                style={{
                    flexGrow: 1,
                    justifyContent: 'start'
                }}
                as={Link}
                to="/categories"
            >
                All documents
                <span style={{ color: '#999', marginLeft: 8 }}>
                    {space.collection.items.size}
                </span>
            </Button>
            <Button
                style={{
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
                onClick={createDocument}
            >
                <Icon svg={addSvg} />
            </Button>
        </Row>
    )

    const statusMap = {
        [ConnectionStatus.Disconnected]: 'Waiting for connection...',
        [ConnectionStatus.Connected]: 'Connecting...',
        [ConnectionStatus.Sync]: 'Receiving changes...',
        [ConnectionStatus.Ready]: 'Connected'
    }

    const status = (
        <div style={{ padding: '0 8px', paddingBottom: 8, color: '#999' }}>
            {statusMap[space.collection.status]}
        </div>
    )

    const sidebar = (
        <Col
            style={{
                width: 375,
                height: '100vh',
                borderRight: '2px solid #555'
            }}
            gap={8}
            align="stretch"
        >
            {notesBar}
            <DocumentList store={store} />
            {spaceBar}
            {/*status*/}
        </Col>
    )

    return (
        <div style={{ display: 'flex' }}>
            {sidebar}
            <div style={{ flexGrow: 1 }}>
                <Switch>
                    <Route
                        path={`/documents/:id`}
                        children={(params) => (
                            <DocumentRoute key={params.id} id={params.id} />
                        )}
                    />
                    <Route
                        path={'/account'}
                        children={(params) => <AccountView />}
                    />
                    <Route
                        path={'/notifications'}
                        children={(params) => <NotificationsView />}
                    />
                    <Route
                        path={'/create-space'}
                        children={(params) => <CreateSpaceView />}
                    />
                    <Route
                        path={'/switch-space'}
                        children={(params) => <SwitchSpaceView />}
                    />
                    <Route
                        path={'/space/members'}
                        children={(params) => <SpaceMembersView />}
                    />
                    <Route
                        path={'/categories'}
                        children={(params) => <CategoriesView />}
                    />
                    <Redirect to="/" />
                </Switch>
            </div>
        </div>
    )
})

const LoginView = () => {
    const store = useStore()
    return (
        <Col align="center" justify="center" style={{ height: '100%' }}>
            <Button
                onClick={() => {
                    store.authenticate({
                        name: 'test',
                        password: 'password'
                    })
                }}
            >
                Login
            </Button>
        </Col>
    )
}

const Root = observer(() => {
    const store = useMemo(() => {
        const s = new Store()
        window.store = s
        return s
    }, [])

    if (!store.isInited) return null

    return (
        <StoreContext.Provider value={store}>
            <OrienteProvider>
                <Router>{store.user ? <SpaceView /> : <LoginView />}</Router>
            </OrienteProvider>
        </StoreContext.Provider>
    )
})

const root = createRoot(document.getElementById('root')!)
root.render(<Root />)
