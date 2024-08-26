import { observer } from "mobx-react-lite"
import { useLocation, useRoute } from "wouter"
import { Col, Row } from "oriente"
import { ItemState } from "sinkron-client"

import notificationsSvg from "@material-design-icons/svg/outlined/notifications.svg"
import addSvg from "@material-design-icons/svg/outlined/add.svg"
import syncSvg from "@material-design-icons/svg/outlined/sync.svg"
import folderSvg from "@material-design-icons/svg/outlined/folder.svg"
import arrowCategoryBackSvg from "@material-design-icons/svg/outlined/subdirectory_arrow_left.svg"

import { useStore, useSpace } from "../store"
import type { DocumentListItemData } from "../store/SpaceStore"
import { Avatar, Button, LinkButton, Icon, ActionStateView } from "../ui"

interface DocumentListCategoryItemProps {
    name: string
    onSelect: () => void
}

const DocumentListCategoryItem = observer(
    (props: DocumentListCategoryItemProps) => {
        const { name, onSelect } = props
        return (
            <Row
                style={{
                    height: 60,
                    padding: 8,
                    borderBottom: "2px solid var(--color-elem)",
                    gap: 12,
                    cursor: "pointer"
                }}
                align="center"
                onClick={onSelect}
            >
                <div>{<Icon svg={folderSvg} />}</div>
                <Col gap={4} style={{ flexGrow: 1, overflow: "hidden" }}>
                    {name}
                </Col>
            </Row>
        )
    }
)

interface DocumentListItemProps {
    data: DocumentListItemData
    isSelected: boolean
    onSelect: () => void
}

const DocumentListItem = observer((props: DocumentListItemProps) => {
    const { data, onSelect, isSelected } = props

    const title = (
        <div
            style={{
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                overflow: "hidden",
                maxWidth: "100%"
            }}
        >
            {!data.title ? (
                <span style={{ opacity: 0.5 }}>Untitled</span>
            ) : (
                data.title
            )}
        </div>
    )
    const subtitle = data.subtitle && (
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
    )

    return (
        <Row
            style={{
                height: 60,
                padding: 8,
                borderBottom: "2px solid var(--color-elem)",
                background: isSelected ? "var(--color-elem)" : "transparent",
                gap: 12,
                cursor: "pointer"
            }}
            onClick={onSelect}
            align="center"
        >
            <Col gap={4} style={{ flexGrow: 1, overflow: "hidden" }}>
                {title}
                {subtitle}
            </Col>
            <div>
                {data.item.state !== ItemState.Synchronized ? (
                    <Icon svg={syncSvg} />
                ) : null}
            </div>
        </Row>
    )
})

interface DocumentListProps {
    selectedDocId?: string
}

const DocumentList = observer((props: DocumentListProps) => {
    const { selectedDocId } = props

    const [_location, navigate] = useLocation()
    const space = useSpace()

    const categoryItems =
        space.category &&
        space.category.children.map((c) => (
            <DocumentListCategoryItem
                key={c.id}
                name={c.name}
                onSelect={() => {
                    space.selectCategory(c.id)
                }}
            />
        ))
    const docItems = space.sortedDocumentList.map((item) => (
        <DocumentListItem
            key={item.id}
            data={item}
            isSelected={item.id === selectedDocId}
            onSelect={() => navigate(`/documents/${item.id}`)}
        />
    ))
    return (
        <>
            {categoryItems}
            {docItems}
        </>
    )
})

const DocumentListView = observer(() => {
    const store = useStore()
    const space = useSpace()
    const [_location, navigate] = useLocation()

    const [match, params] = useRoute("/documents/:id")
    const selectedDocId = match ? params.id : undefined

    const canCreate = space.space.role !== "readonly"
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
            <LinkButton
                style={{ flexGrow: 1, justifyContent: "start" }}
                to="/categories"
            >
                {space.category ? space.category.name : "All documents"}
            </LinkButton>
            <Button onClick={createDocument} isDisabled={!canCreate}>
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

    const list = (
        <div style={{ flexGrow: 1, overflow: "auto" }}>
            <ActionStateView state={space.loadedState}>
                {() => {
                    return space.collection.isLoaded ? (
                        <DocumentList selectedDocId={selectedDocId} />
                    ) : null
                }}
            </ActionStateView>
        </div>
    )

    const bottomBar = (
        <Row gap={8}>
            <LinkButton
                style={{ justifyContent: "start", flexGrow: 1 }}
                to="/account"
            >
                <Row gap={8} align="center">
                    <Avatar name={space.space.name} />
                    <div style={{ flexGrow: 1 }}>{space.space.name}</div>
                </Row>
            </LinkButton>
            <LinkButton to="/notifications" style={{ position: "relative" }}>
                <Icon svg={notificationsSvg} />
                {unreadMarker}
            </LinkButton>
        </Row>
    )

    return (
        <Col style={{ alignItems: "stretch", height: "100dvh" }} gap={8}>
            {topBar}
            {list}
            {bottomBar}
        </Col>
    )
})

export default DocumentListView
