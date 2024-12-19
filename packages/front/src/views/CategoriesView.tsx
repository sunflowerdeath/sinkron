import { useState } from "react"
import { observer } from "mobx-react-lite"
import { Col, Row } from "oriente"
import { useLocation } from "wouter"

import moreHorizSvg from "@material-design-icons/svg/outlined/more_horiz.svg"
import keyboardArrowDownSvg from "@material-design-icons/svg/outlined/keyboard_arrow_down.svg"
import keyboardArrowUpSvg from "@material-design-icons/svg/outlined/keyboard_arrow_up.svg"

import { Container, Menu, MenuItem, Button, LinkButton, Icon } from "~/ui"
import { useSpace } from "~/store"
import type { CategoryTreeNode, SpaceView } from "~/store/spaceStore"

type CategoriesListItemProps = {
    category: CategoryTreeNode
    readOnly: boolean
    onDelete: (id: string) => void
    onSelect: (id: string) => void
}

const CategoryListItem = (props: CategoriesListItemProps) => {
    const { category, readOnly, onSelect, onDelete } = props

    const [_location, navigate] = useLocation()
    const [isOpen, setIsOpen] = useState(false)
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

    const openButton = hasChildren && (
        <Button onClick={() => setIsOpen((v) => !v)}>
            <Icon svg={isOpen ? keyboardArrowUpSvg : keyboardArrowDownSvg} />
        </Button>
    )

    return (
        <>
            <Row align="center" gap={8} style={{ alignSelf: "stretch" }}>
                {openButton}
                <Button
                    style={{
                        flexGrow: 1,
                        justifyContent: "start",
                        flexShrink: 1,
                        overflow: "hidden"
                    }}
                    onClick={() => onSelect(category.id)}
                    kind="transparent"
                >
                    <Row
                        style={{
                            flexGrow: 1,
                            overflow: "hidden"
                        }}
                        gap={16}
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
                        <div style={{ color: "var(--color-secondary)" }}>
                            {category.count}
                        </div>
                    </Row>
                </Button>
                {!readOnly && (
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
                )}
            </Row>
            {hasChildren && isOpen && (
                <Col style={{ marginLeft: 32, alignSelf: "normal" }}>
                    <CategoryList
                        categories={category.children}
                        readOnly={readOnly}
                        onSelect={onSelect}
                        onDelete={onDelete}
                    />
                </Col>
            )}
        </>
    )
}

interface CategoryListProps {
    categories: CategoryTreeNode[]
    readOnly: boolean
    onDelete: (id: string) => void
    onSelect: (id: string) => void
}

const CategoryList = (props: CategoryListProps) => {
    const { categories, readOnly, onSelect, onDelete } = props
    return (
        <Col style={{ alignSelf: "stretch" }} gap={8}>
            {categories.map((c) => (
                <CategoryListItem
                    key={c.id}
                    category={c}
                    readOnly={readOnly}
                    onSelect={onSelect}
                    onDelete={onDelete}
                />
            ))}
        </Col>
    )
}

const CategoriesView = observer(() => {
    const spaceStore = useSpace()
    const [_location, navigate] = useLocation()

    const onDelete = (id: string) => {
        spaceStore.deleteCategory(id)
    }

    const setView = (view: SpaceView) => {
        spaceStore.view = view
        navigate("/")
    }

    if (spaceStore.metaItem === undefined) {
        return (
            <Container title="Categories" onClose={() => navigate("/")}>
                Loading...
            </Container>
        )
    }

    const readOnly = spaceStore.space.role === "readonly"

    const createButton = !readOnly && (
        <LinkButton style={{ alignSelf: "normal" }} to="/categories/new">
            Create category
        </LinkButton>
    )

    const allDocumentsButton = (
        <Button
            style={{
                alignSelf: "normal",
                justifyContent: "start"
            }}
            kind="transparent"
            onClick={() => setView({ kind: "all" })}
        >
            <Row gap={16} align="center" style={{ flexGrow: 1 }}>
                <div>All documents</div>
                <div style={{ color: "var(--color-secondary)" }}>
                    {spaceStore.documents.length}
                </div>
            </Row>
        </Button>
    )

    const publishedCount = spaceStore.publishedDocuments.length
    const publishedButton = publishedCount > 0 && (
        <Button
            style={{
                alignSelf: "normal",
                justifyContent: "start"
            }}
            kind="transparent"
            onClick={() => setView({ kind: "published" })}
        >
            <Row gap={16} align="center" style={{ flexGrow: 1 }}>
                <div>Published</div>
                <div style={{ color: "var(--color-secondary)" }}>
                    {publishedCount}
                </div>
            </Row>
        </Button>
    )

    const list = (
        <Col gap={8} style={{ alignSelf: "stretch" }}>
            {allDocumentsButton}
            {publishedButton}
            <CategoryList
                readOnly={readOnly}
                categories={spaceStore.categoryTree.nodes}
                onDelete={onDelete}
                onSelect={(id) => setView({ kind: "category", id })}
            />
        </Col>
    )

    return (
        <Container title="Categories" onClose={() => navigate("/")}>
            <Col gap={8}>
                {createButton}
                {list}
            </Col>
        </Container>
    )
})

export { CategoriesView }
