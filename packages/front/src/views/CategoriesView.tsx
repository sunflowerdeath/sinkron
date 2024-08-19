import { useState } from "react"
import { observer } from "mobx-react-lite"
import { Col, Row } from "oriente"
import { useLocation } from "wouter"

import moreHorizSvg from "@material-design-icons/svg/outlined/more_horiz.svg"
import keyboardArrowDownSvg from "@material-design-icons/svg/outlined/keyboard_arrow_down.svg"
import keyboardArrowUpSvg from "@material-design-icons/svg/outlined/keyboard_arrow_up.svg"

import { Menu, MenuItem, Button, LinkButton, Icon } from "../ui"
import Container from "../ui/Container"
import { useSpace } from "../store"
import { Category } from "../entities"
import type { Tree, TreeNode } from "../utils/listToTree"

type CategoriesListItemProps = {
    category: TreeNode<Category>
    onDelete: (id: string) => void
    onSelect: (id: string) => void
}

const CategoryListItem = (props: CategoriesListItemProps) => {
    const { category, onSelect, onDelete } = props

    const [isCollapsed, setIsCollapsed] = useState(true)
    const [_location, navigate] = useLocation()

    const hasChildren = category.children.length > 0

    const menu = () => (
        <>
            <MenuItem
                onSelect={() =>
                    navigate(`/categories/new?parent=${category.id}`)
                }
            >
                Create subcategory
            </MenuItem>
            <MenuItem
                onSelect={() => navigate(`/categories/${category.id}/edit`)}
            >
                Edit
            </MenuItem>
            <MenuItem
                onSelect={() => {
                    onDelete(category.id)
                }}
            >
                Delete
            </MenuItem>
        </>
    )

    return (
        <>
            <Row align="center" gap={8} style={{ alignSelf: "stretch" }}>
                {hasChildren ? (
                    <Button onClick={() => setIsCollapsed((v) => !v)}>
                        <Icon
                            svg={
                                isCollapsed
                                    ? keyboardArrowDownSvg
                                    : keyboardArrowUpSvg
                            }
                        />
                    </Button>
                ) : (
                    <div style={{ width: 60 }} />
                )}
                <Button
                    style={{
                        flexGrow: 1,
                        justifyContent: "start",
                        flexShrink: 1,
                        overflow: "hidden"
                    }}
                    kind="transparent"
                    onClick={() => onSelect(category.id)}
                >
                    <div
                        style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                        }}
                    >
                        {category.name}
                    </div>
                </Button>
                <Menu
                    menu={menu}
                    styles={{ list: { background: "#555" } }}
                    placement={{ padding: 0, offset: 8, align: "end" }}
                    autoSelectFirstItem={false}
                >
                    {(ref, { open }) => (
                        <Button onClick={open} ref={ref}>
                            <Icon svg={moreHorizSvg} />
                        </Button>
                    )}
                </Menu>
            </Row>
            {hasChildren && !isCollapsed && (
                <Col style={{ marginLeft: 32, alignSelf: "normal" }}>
                    <CategoryList
                        categories={category.children}
                        onSelect={onSelect}
                        onDelete={onDelete}
                    />
                </Col>
            )}
        </>
    )
}

interface CategoryListProps {
    categories: TreeNode<Category>[]
    onDelete: (id: string) => void
    onSelect: (id: string) => void
}

const CategoryList = (props: CategoryListProps) => {
    const { categories, onSelect, onDelete } = props
    return (
        <Col style={{ alignSelf: "stretch" }} gap={8}>
            {categories.map((c) => (
                <CategoryListItem
                    key={c.id}
                    category={c}
                    onSelect={onSelect}
                    onDelete={onDelete}
                />
            ))}
        </Col>
    )
}

const CategoriesView = observer(() => {
    const space = useSpace()
    const [_location, navigate] = useLocation()

    const onDelete = (id: string) => {
        space.deleteCategory(id)
    }

    const selectCategory = (id: string | null) => {
        space.selectCategory(id)
        navigate("/")
    }

    let list
    if (space.collection.initialSyncCompleted) {
        list = (
            <Col gap={8}>
                <LinkButton
                    style={{ alignSelf: "normal" }}
                    to="/categories/new"
                >
                    Create category
                </LinkButton>
                <Col gap={8} style={{ alignSelf: "stretch" }}>
                    <Button
                        style={{ alignSelf: "normal", justifyContent: "start" }}
                        kind="transparent"
                        onClick={() => selectCategory(null)}
                    >
                        <Row gap={8} align="center">
                            <div>All documents</div>
                            {/*<div style={{ color: "#999" }}>2</div>*/}
                        </Row>
                    </Button>
                    <CategoryList
                        categories={space.categoryTree.nodes}
                        onDelete={onDelete}
                        onSelect={(id) => selectCategory(id)}
                    />
                </Col>
            </Col>
        )
    } else {
        list = "Loading..."
    }

    return (
        <Container title="Categories" onClose={() => navigate("/")}>
            {list}
        </Container>
    )
})

export default CategoriesView
