import { observer } from "mobx-react-lite"
import { useLocation, useRoute } from "wouter"
import { Col, Row } from "oriente"
import { ItemState } from "@sinkron/client/lib/collection"

import notificationsSvg from "~/exclamation.svg"
import addSvg from "@material-design-icons/svg/outlined/add.svg"
import syncSvg from "@material-design-icons/svg/outlined/sync.svg"
import lockSvg from "@material-design-icons/svg/outlined/lock.svg"
import pinSvg from "@material-design-icons/svg/outlined/push_pin.svg"
import folderSvg from "@material-design-icons/svg/outlined/folder.svg"
import arrowCategoryBackSvg from "@material-design-icons/svg/outlined/subdirectory_arrow_left.svg"

import { useStore, useSpace } from "../store"
import type { DocumentListItemData } from "../store/SpaceStore"
import { Button, LinkButton, Icon, ActionStateView } from "../ui"
import { Picture } from "~/components/picture"
import env from "~/env"

interface DocumentListCategoryItemProps {
    name: string
    count: number
    onSelect: () => void
}

const DocumentListCategoryItem = observer(
    (props: DocumentListCategoryItemProps) => {
        const { name, onSelect, count } = props
        return (
            <Row
                style={{
                    height: 60,
                    padding: 8,
                    borderBottom: "2px solid var(--color-elem)",
                    gap: 10,
                    cursor: "pointer"
                }}
                align="center"
                onClick={onSelect}
            >
                <Icon svg={folderSvg} />
                <div
                    style={{
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        flexGrow: 1
                    }}
                >
                    {name}
                </div>
                <div style={{ color: "var(--color-secondary)" }}>{count}</div>
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
            <Row gap={4}>
                {data.item.state !== ItemState.Synchronized && (
                    <Icon
                        svg={syncSvg}
                        style={{ fill: "var(--color-secondary)" }}
                    />
                )}
                {data.item.data?.isPinned && (
                    <Icon
                        svg={pinSvg}
                        style={{ fill: "var(--color-secondary)" }}
                    />
                )}
                {data.item.data?.isLocked && (
                    <Icon
                        svg={lockSvg}
                        style={{ fill: "var(--color-secondary)" }}
                    />
                )}
            </Row>
        </Row>
    )
})

interface DocumentListProps {
    selectedDocId?: string
}

const DocumentList = observer((props: DocumentListProps) => {
    const { selectedDocId } = props

    const [_location, navigate] = useLocation()
    const spaceStore = useSpace()

    const categoryItems =
        spaceStore.viewProps.kind === "category" &&
        spaceStore.viewProps.children.map((c) => (
            <DocumentListCategoryItem
                key={c.id}
                name={c.name}
                count={c.count}
                onSelect={() => {
                    spaceStore.view = { kind: "category", id: c.id }
                }}
            />
        ))

    const docItems = spaceStore.sortedDocumentList.map((item) => (
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

    const upButton = space.view.kind !== "all" && (
        <Button
            onClick={() => {
                if (space.viewProps.kind === "category") {
                    const parent = space.viewProps.parent
                    space.view = parent
                        ? { kind: "category", id: parent }
                        : { kind: "all" }
                } else {
                    space.view = { kind: "all" }
                }
            }}
        >
            <Icon
                svg={arrowCategoryBackSvg}
                style={{ transform: "rotate(90deg)" }}
            />
        </Button>
    )

    const topBar = (
        <Row gap={8}>
            {upButton}
            <LinkButton
                style={{
                    flexGrow: 1,
                    justifyContent: "start",
                    display: "flex",
                    gap: 10
                }}
                to="/categories"
            >
                <div
                    style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flexGrow: 1
                    }}
                >
                    {space.viewProps.name}
                </div>
                <div style={{ color: "var(--color-secondary)" }}>
                    {space.viewProps.count}
                </div>
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
                    <Picture picture={space.space.picture} />
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
        <Col
            style={{
                alignItems: "stretch",
                height: env.tauri ? "100vh" : "100dvh"
            }}
            gap={8}
        >
            {topBar}
            {list}
            {bottomBar}
        </Col>
    )
})

export default DocumentListView
