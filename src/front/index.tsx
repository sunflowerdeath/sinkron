import { useState, useMemo, useEffect, useCallback, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useGetSet } from 'react-use'
import {
    makeAutoObservable,
    makeObservable,
    observable,
    ObservableMap
} from 'mobx'
import { observer } from 'mobx-react-lite'
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
import { compareAsc, compareDesc } from 'date-fns'
import Cookies from 'js-cookie'

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
import { Result, ResultType } from '../result'

import { forwardRef } from 'react'
import {
    OrienteProvider,
    Col,
    Row,
    useTaply,
    TapState,
    useStyles,
    StyleProps,
    StyleMap,
    mergeRefs,
    Menu,
    MenuItem
} from 'oriente'

import { fetchJson, FetchError } from './fetchJson'
import { TransformedMap } from './transformedMap'

interface ButtonStyleProps {
    isFocused: boolean
}

interface ButtonProps extends StyleProps<[ButtonProps, TapState]> {
    as?: React.ElementType
    children: React.ReactNode
    onClick: () => void
    isDisabled?: boolean
    onChangeTapState?: (tapState: TapState) => void
}

const buttonStyles = (
    props: ButtonProps,
    { isFocused, isHovered, isPressed }: TapState
): StyleMap => {
    return {
        root: {
            color: 'var(--color-text)',
            textDecoration: 'none',
            height: 60,
            minWidth: 60,
            boxSizing: 'border-box',
            justifyContent: 'center',
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            cursor: props.isDisabled ? 'not-allowed' : 'pointer',
            outline: 'none',
            userSelect: 'none',
            background: isHovered ? '#666' : '#555',
            opacity: props.isDisabled ? 0.5 : 1,
            boxShadow: isFocused ? 'inset 0 0 0 2px #ccc' : 'none',
            WebkitTapHighlightColor: 'transparent'
        }
    }
}

const Button = forwardRef((props: ButtonProps, ref) => {
    const { as, children, onClick, isDisabled, onChangeTapState, ...rest } =
        props
    const Component = as || 'div'
    const { tapState, render } = useTaply({
        onClick,
        isDisabled,
        onChangeTapState
    })
    const styles = useStyles(buttonStyles, [props, tapState])
    return render((attrs, taplyRef) => {
        return createElement(
            Component,
            {
                ...rest,
                style: styles.root,
                ...attrs,
                ref: mergeRefs(ref, taplyRef)
            },
            children
        )
    })
})

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

interface Space {
    id: string
    name: string
    owner: User
    collectionId: string
}

interface User {
    id: string
    name: string
    spaces: Space[]
}

type Credentials = { name: string; password: string }

const authLocalStorageKey = 'auth'

type AuthToken = { token: string; user: { id: string; name: string } }

class AppStore {
    isInited: boolean = false

    user?: User = undefined
    space?: Space = undefined

    constructor() {
        this.init()
        makeAutoObservable(this)
    }

    setUser(user: User) {
        this.user = user
        this.space = this.user.spaces?.[0]
        localStorage.setItem('user', JSON.stringify(this.user))
    }

    async init() {
        const user = localStorage.getItem('user')
        if (user !== null) {
            this.setUser(JSON.parse(user))
            await this.fetchProfile()
        }
        this.isInited = true
    }

    async fetchProfile() {
        console.log('Fetching user...')
        const res = await fetchJson<User>({ url: '/api/profile' })
        if (res.isOk) {
            this.setUser(res.value)
            console.log('Fetch user success')
        } else {
            if (res.error.kind === 'http') {
                // TODO if session expired / terminated
                console.log('Fetch user error')
                this.logout()
            }
        }
    }

    async authenticate(credentials: Credentials) {
        const res = await fetchJson<User>({
            method: 'POST',
            url: '/api/login',
            data: credentials
        })
        if (res.isOk) {
            this.setUser(res.value)
            console.log('Logged in')
        } else {
            return res.error
        }
    }

    logout() {
        console.log('Logout')
        this.user = undefined
        this.space = undefined
        localStorage.removeItem('user')
        history.pushState({}, '', '/')
    }

    async createSpace(name: string) {
        const state = fromPromise(
            fetchJson({
                method: 'POST',
                url: '/api/spaces/new',
                data: { name }
            })
        )
        return state
    }
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

const getUpdatedAt = <T,>(item: Item<T>) =>
    item.state === ItemState.Synchronized
        ? item.updatedAt!
        : item.localUpdatedAt!

class SpaceStore {
    space: Space
    collection: Collection<Document>
    list: TransformedMap<Item<Document>, DocumentListItemData>

    constructor(space: Space) {
        this.space = space

        const col = `spaces/${space.id}`
        const store = new IndexedDbCollectionStore(col)
        const token = Cookies.get('token')
        const transport = new WebsocketTransport(`ws://127.0.0.1:8080/${token}`)
        this.collection = new Collection<Document>({
            transport,
            col,
            store
        })

        // @ts-ignore
        window.col = this.collection

        this.list = new TransformedMap({
            source: this.collection.items,
            filter: (item) => item.local !== null,
            transform: (item) => this.makeItemData(item)
        })
    }

    makeItemData(item) {
        const doc = item.local!.content
        const firstNode = doc.children[0]
        const firstNodeText = firstNode
            ? firstNode.children.map((c) => c.text).join('')
            : ''
        const title = firstNodeText.length > 0 ? firstNodeText : null
        let subtitle
        if (title !== null && title.length > 0) {
            const secondNode = doc.children[1]
            const secondNodeText = secondNode
                ? secondNode.children.map((c) => c.text).join('')
                : ''
            subtitle = secondNodeText.slice(0, 100)
        }
        return { id: item.id, item, title, subtitle }
    }

    get sortedList() {
        return Array.from(this.list.map.values()).sort((a, b) =>
            compareDesc(getUpdatedAt(a.item), getUpdatedAt(b.item))
        )
    }
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
                <div>
                    <MenuItem style={{ height: 45, padding: '0 8px' }}>
                        Share
                    </MenuItem>
                    <MenuItem
                        style={{ height: 45, padding: '0 8px' }}
                        onSelect={onDelete}
                    >
                        Delete
                    </MenuItem>
                </div>
            </Col>
        )
    }

    return (
        <div
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
            <div
                style={{
                    height: 60,
                    display: 'flex',
                    justifyContent: 'flex-end'
                }}
            >
                <Menu menu={menu} styles={{ list: { background: '#555' } }}>
                    {(ref, { open }) => (
                        <Button onClick={open} ref={ref}>
                            ...
                        </Button>
                    )}
                </Menu>
            </div>
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
        </div>
    )
})

interface DocumentRouteProps {
    store: DocumentStore
    id: string
}

const DocumentRoute = observer((props: DocumentRouteProps) => {
    const { store, id } = props

    const [location, navigate] = useLocation()

    const item = store.collection.items.get(id)
    if (item === undefined || item.local === null) {
        return <Redirect to="/" />
    }

    const onChange = (editor: Editor) => {
        const ops = editor.operations.filter(
            (op) => op.type !== 'set_selection'
        )
        if (ops.length > 0) {
            store.collection.change(id, (doc) =>
                applySlateOps(doc.content, ops)
            )
        }
    }

    const onDelete = () => {
        store.collection.delete(id)
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

interface DocumentListProps {
    store: DocumentStore
}

const DocumentList = observer((props: DocumentListProps) => {
    const { store } = props

    const [location, navigate] = useLocation()
    const [match, params] = useRoute('/documents/:id')
    const selectedId = match ? params.id : undefined

    let content
    if (store.list.map.size > 0) {
        content = store.sortedList.map((item) => (
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

const Heading = (props) => {
    return (
        <h1 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>
            {props.children}
        </h1>
    )
}

type AccountViewProps = {
    store: AppStore
}

const AccountView = observer((props: AccountViewProps) => {
    const { store } = props

    return (
        <Col gap={40} style={{ padding: '18px 40px' }}>
            <Heading>Account and spaces</Heading>
            <Col gap={16}>
                <Heading>Account</Heading>
                <Row gap={8} align="center">
                    <div
                        style={{
                            height: 45,
                            width: 45,
                            background: '#53804C',
                            borderRadius: 10
                        }}
                    />
                    <div>@sunflowerdeath</div>
                </Row>
                <Row gap={8}>
                    <Button>Account settings</Button>
                    <Button onClick={() => store.logout()}>Logout</Button>
                </Row>
            </Col>
            <Col gap={16}>
                <Heading>Space</Heading>
                <Row gap={8}>
                    <div
                        style={{
                            height: 45,
                            width: 45,
                            background: '#53804C',
                            borderRadius: 10
                        }}
                    />
                    <Col>
                        <div>@sunflowerdeath</div>
                        <div style={{ opacity: '.6' }}>1 member - Admin</div>
                    </Col>
                </Row>
                <Row gap={8}>
                    <Button>Invite member</Button>
                    <Button>Members list</Button>
                    <Button>Space settings</Button>
                    <Button>Leave space</Button>
                </Row>
            </Col>
            <Row gap={8}>
                <Button>Switch space</Button>
                <Button as={Link} to="/new-space">
                    Create new space
                </Button>
            </Row>
        </Col>
    )
})

type CreateSpaceViewProps = {
    store: AppStore
}

const CreateSpaceView = observer((props: CreateSpaceViewProps) => {
    const { store } = props

    const [location, navigate] = useLocation()

    const [name, setName] = useState('')

    const [createState, setCreateState] = useState<IPromiseBasedObservable<
        ResultType<object, FetchError>
    > | null>(null)
    const create = async () => {
        const state = store.createSpace(name)
        setCreateState(state)
        const res = await state
        if (res.isOk) {
            store.user!.spaces.push(res.value as Space)
            store.space = res.value as Space
            navigate('/')
        } else {
            alert(res.error)
        }
    }

    return (
        <Col gap={20} style={{ padding: '0 40px', paddingTop: 18 }}>
            <Heading>Create new space</Heading>
            Name:
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <Button
                onClick={create}
                isDisabled={createState?.state === 'pending'}
            >
                Create
            </Button>
        </Col>
    )
})

interface SpaceViewProps {
    store: AppStore
}

const SpaceView = observer((props: SpaceViewProps) => {
    const store = useMemo(() => new SpaceStore(props.store.space!), [])

    const [location, navigate] = useLocation()

    const createDocument = () => {
        const id = store.collection.create(makeInitial())
        navigate(`/documents/${id}`)
    }

    const spaceBar = (
        <Button style={{ justifyContent: 'start' }} as={Link} to="/account">
            Sunflowerdeath
        </Button>
    )

    const notesBar = (
        <Row gap={8}>
            <Button
                style={{
                    flexGrow: 1,
                    justifyContent: 'start'
                }}
            >
                Documents
                <span style={{ color: '#999', marginLeft: 8 }}>
                    {store.collection.items.size}
                </span>
            </Button>
            <Button
                style={{
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
                onClick={createDocument}
            >
                +
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
            {statusMap[store.collection.status]}
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
            {spaceBar}
            {notesBar}
            <DocumentList store={store} />
            {status}
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
                            <DocumentRoute
                                key={params.id}
                                store={store}
                                id={params.id}
                            />
                        )}
                    />
                    <Route
                        path={`/account`}
                        children={(params) => (
                            <AccountView store={props.store} />
                        )}
                    />
                    <Route
                        path={`/new-space`}
                        children={(params) => (
                            <CreateSpaceView store={props.store} />
                        )}
                    />
                    <Redirect to="/" />
                </Switch>
            </div>
        </div>
    )
})

interface LoginViewProps {
    store: AppStore
}

const LoginView = (props: LoginViewProps) => {
    const { store } = props
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
        const s = new AppStore()
        window.store = s
        return s
    }, [])

    if (!store.isInited) return null

    return (
        <OrienteProvider>
            <Router>
                {store.user ? (
                    <SpaceView store={store} />
                ) : (
                    <LoginView store={store} />
                )}
            </Router>
        </OrienteProvider>
    )
})

const root = createRoot(document.getElementById('root')!)
root.render(<Root />)
