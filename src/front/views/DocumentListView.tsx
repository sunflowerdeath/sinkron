import { observer } from 'mobx-react-lite'
import {  useLocation, useRoute, Link } from 'wouter'
import { Col, Row } from 'oriente'

import notificationsSvg from '@material-design-icons/svg/outlined/notifications.svg'
import addSvg from '@material-design-icons/svg/outlined/add.svg'
import syncSvg from '@material-design-icons/svg/outlined/sync.svg'
import arrowCategoryBackSvg from '@material-design-icons/svg/outlined/subdirectory_arrow_left.svg'

import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { Store, useStore, DocumentListItemData } from '../store'
import { ItemState, } from '../../sinkron/client'

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
                {data.item.state !== ItemState.Synchronized ? (
                    <Icon svg={syncSvg} />
                ) : null}
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
                isSelected={item.id === selectedId}
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


const DocumentListView = observer(() => {
    const store = useStore()
    const space = store.spaceStore!

    const [location, navigate] = useLocation()

    const createDocument = () => {
        const id = space.createDocument()
        navigate(`/documents/${id}`)
    }

    const topBar = (
        <Row gap={8}>
            {space.currentCategoryId !== null && (
                <Button
                    onClick={() => {
                        space.currentCategoryId = null
                    }}
                >
                    <Icon
                        svg={arrowCategoryBackSvg}
                        style={{ transform: 'rotate(90deg)' }}
                    />
                </Button>
            )}
            <Button
                style={{ flexGrow: 1, justifyContent: 'start' }}
                as={Link}
                to="/categories"
            >
                {space.currentCategory?.name || 'All documents'}
            </Button>
            <Button onClick={createDocument}>
                <Icon svg={addSvg} />
            </Button>
        </Row>
    )

    const bottomBar = (
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

    return (
        <Col style={{ alignItems: 'stretch', height: '100vh' }} gap={8}>
            {topBar}
            <DocumentList />
            {bottomBar}
        </Col>
    )
})

export default DocumentListView
