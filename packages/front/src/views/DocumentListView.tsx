import { observer } from "mobx-react-lite"
import { useLocation, useRoute, Link } from "wouter"
import { Col, Row } from "oriente"
import { ItemState } from "sinkron-client"

import notificationsSvg from "@material-design-icons/svg/outlined/notifications.svg"
import addSvg from "@material-design-icons/svg/outlined/add.svg"
import syncSvg from "@material-design-icons/svg/outlined/sync.svg"
import arrowCategoryBackSvg from "@material-design-icons/svg/outlined/subdirectory_arrow_left.svg"

import { useStore, useSpace, DocumentListItemData } from "../store"
import { Avatar } from "../ui/avatar"
import { Button } from "../ui/button"
import { Icon } from "../ui/icon"
import ActionStateView from "../ui/ActionStateView"

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
                borderBottom: "2px solid #555",
                background: isSelected ? "#555" : "transparent",
                gap: 12,
                cursor: "pointer"
            }}
            onClick={onSelect}
            align="center"
        >
            <Col gap={4} style={{ flexGrow: 1, overflow: "hidden" }}>
                <div>
                    {data.title ?? (
                        <span style={{ opacity: 0.5 }}>Empty document</span>
                    )}
                </div>
                {data.subtitle && (
                    <div
                        style={{
                            opacity: ".5",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            maxWidth: "100%"
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
    const space = useSpace()
    const [location, navigate] = useLocation()
    const [match, params] = useRoute("/documents/:id")
    const selectedId = match ? params.id : undefined

    return (
        <div style={{ flexGrow: 1, overflow: "auto" }}>
            <ActionStateView state={space.loadedState}>
                {() => {
                    let content
                    if (
                        space.collection.isLoaded &&
                        space.documentList.map.size > 0
                    ) {
                        content = space.sortedDocumentList.map((item) => (
                            <DocumentListItem
                                key={item.id}
                                data={item}
                                isSelected={item.id === selectedId}
                                onSelect={() =>
                                    navigate(`/documents/${item.id}`)
                                }
                            />
                        ))
                    }
                    return content
                }}
            </ActionStateView>
        </div>
    )
})

const DocumentListView = observer(() => {
    const store = useStore()
    const space = useSpace()
    const [location, navigate] = useLocation()

    const createDocument = () => {
        const id = space.createDocument()
        navigate(`/documents/${id}`)
    }

    const topBar = (
        <Row gap={8}>
            {space.category !== null && (
                <Button
                    onClick={() => {
                        const parent = space.category
                            ? space.category.parent
                            : null
                        space.selectCategory(parent)
                    }}
                >
                    <Icon
                        svg={arrowCategoryBackSvg}
                        style={{ transform: "rotate(90deg)" }}
                    />
                </Button>
            )}
            <Button
                style={{ flexGrow: 1, justifyContent: "start" }}
                as={Link}
                to="/categories"
            >
                {space.category?.name || "All documents"}
            </Button>
            <Button onClick={createDocument}>
                <Icon svg={addSvg} />
            </Button>
        </Row>
    )

    const unreadMarker = store.user.hasUnreadNotifications && (
        <div
            style={{
                width: 12,
                height: 12,
                background: "var(--color-error)",
                position: "absolute",
                right: 8,
                top: 8,
                borderRadius: "50%"
            }}
        />
    )

    const bottomBar = (
        <Row gap={8}>
            <Button
                style={{ justifyContent: "start", flexGrow: 1 }}
                as={Link}
                to="/account"
            >
                <Row gap={8} align="center">
                    <Avatar name={space.space.name} />
                    <div style={{ flexGrow: 1 }}>{space.space.name}</div>
                </Row>
            </Button>
            <Button
                as={Link}
                to="/notifications"
                style={{ position: "relative" }}
            >
                <Icon svg={notificationsSvg} />
                {unreadMarker}
            </Button>
        </Row>
    )

    return (
        <Col style={{ alignItems: "stretch", height: "100dvh" }} gap={8}>
            {topBar}
            <DocumentList />
            {bottomBar}
        </Col>
    )
})

export default DocumentListView
