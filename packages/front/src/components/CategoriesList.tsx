import { Row } from "oriente"

import closeSvg from "@material-design-icons/svg/outlined/close.svg"

import { Button } from "../ui/button"
import { Icon } from "../ui/icon"
import { useSpace } from "../store"

interface CategoryListItemProps {
    item: { id: string; name: string }
    onSelect: () => void
    onRemove: () => void
}

const CategoryListItem = (props: CategoryListItemProps) => {
    const { item, onSelect, onRemove } = props
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
            <Button kind="transparent" size="s" onClick={onRemove}>
                <Icon svg={closeSvg} />
            </Button>
        </Row>
    )
}

interface CategoriesListProps {
    items: { id: string; name: string }[]
    onRemove: (id: string) => void
}

const CategoriesList = (props: CategoriesListProps) => {
    const { items, onRemove } = props
    const spaceStore = useSpace()
    return (
        <Row gap={8} style={{ height: 60, flexShrink: 0 }} align="center">
            {items.map((item) => (
                <CategoryListItem
                    key={item.id}
                    item={item}
                    onSelect={() => {
                        spaceStore.selectCategory(item.id)
                        // TODO on mobile go to list
                    }}
                    onRemove={() => onRemove(item.id)}
                />
            ))}
        </Row>
    )
}

export default CategoriesList
