import { Row } from "oriente"
import { useLocation } from "wouter"
import { useMedia } from "react-use"

import closeSvg from "@material-design-icons/svg/outlined/close.svg"

import { Button, Icon } from "~/ui"
import { useSpaceStore } from "~/store"

interface CategoryListItemProps {
    item: { id: string; name: string }
    readOnly: boolean
    onSelect: () => void
    onRemove: () => void
}

const CategoryListItem = (props: CategoryListItemProps) => {
    const { item, onSelect, onRemove, readOnly } = props
    return (
        <Row align="center" style={{ background: "#444" }} key={item.id}>
            <Button
                kind="transparent"
                size="s"
                style={{
                    paddingLeft: 6,
                    paddingRight: 6,
                    boxSizing: "border-box",
                    maxWidth: 125,
                    overflow: "hidden"
                }}
                onClick={onSelect}
            >
                <div
                    style={{
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap"
                    }}
                >
                    {item.name}
                </div>
            </Button>
            {!readOnly && (
                <Button kind="transparent" size="s" onClick={onRemove}>
                    <Icon svg={closeSvg} />
                </Button>
            )}
        </Row>
    )
}

interface CategoriesListProps {
    items: { id: string; name: string }[]
    readOnly: boolean
    onRemove: (id: string) => void
}

const CategoriesList = (props: CategoriesListProps) => {
    const { items, onRemove, readOnly } = props
    const spaceStore = useSpaceStore()
    const [_location, navigate] = useLocation()
    const isMobile = useMedia("(max-width: 1023px)")
    return (
        <Row gap={8} style={{ height: 60, flexShrink: 0 }} align="center">
            {items.map((item) => (
                <CategoryListItem
                    key={item.id}
                    item={item}
                    onSelect={() => {
                        spaceStore.view = { kind: "category", id: item.id }
                        if (isMobile) navigate("/")
                    }}
                    readOnly={readOnly}
                    onRemove={() => onRemove(item.id)}
                />
            ))}
        </Row>
    )
}

export { CategoriesList }
