import { useState } from "react"
import { without } from "lodash-es"

import checkBoxSvg from "@material-design-icons/svg/outlined/check_box.svg"
import checkBoxOutlineSvg from "@material-design-icons/svg/outlined/check_box_outline_blank.svg"
import keyboardArrowDownSvg from "@material-design-icons/svg/outlined/keyboard_arrow_down.svg"
import keyboardArrowUpSvg from "@material-design-icons/svg/outlined/keyboard_arrow_up.svg"

import { Col, Row, Container, LinkButton, Button, Icon } from "~/ui"
import { CategoriesList } from "~/components/categoriesList"
import type { CategoryTree, CategoryTreeNode } from "~/store/spaceStore"

interface CategoriesTreeItemProps {
    value: string[]
    onChange: (value: string[]) => void
    category: CategoryTreeNode
    readOnly: boolean
}

const CategoriesTreeItem = (props: CategoriesTreeItemProps) => {
    const { category, value, onChange, readOnly } = props

    const hasChildren = category.children.length > 0
    const isSelected = value.includes(category.id)
    const [isOpen, setIsOpen] = useState(false)

    const openButton = hasChildren && (
        <Button onClick={() => setIsOpen((v) => !v)}>
            <Icon svg={isOpen ? keyboardArrowUpSvg : keyboardArrowDownSvg} />
        </Button>
    )

    return (
        <Col gap={8} style={{ alignSelf: "stretch" }}>
            <Row
                align="center"
                style={{ alignSelf: "stretch", overflow: "hidden" }}
                gap={8}
            >
                <Button
                    kind="transparent"
                    style={{
                        flexGrow: 1,
                        justifyContent: "start",
                        gap: 8,
                        overflow: "hidden",
                        flexShrink: 1,
                        cursor: "default",
                        opacity: 1
                    }}
                    onClick={() => {
                        const nextValue = isSelected
                            ? without(value, category.id)
                            : [...value, category.id]
                        onChange(nextValue)
                    }}
                    isDisabled={readOnly}
                >
                    <Icon svg={isSelected ? checkBoxSvg : checkBoxOutlineSvg} />
                    <div
                        style={{
                            flexGrow: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                        }}
                    >
                        {category.name}
                    </div>
                </Button>
                {openButton}
            </Row>
            {hasChildren && isOpen && (
                <div style={{ marginLeft: 32, alignSelf: "stretch" }}>
                    <CategoriesTree
                        value={value}
                        onChange={onChange}
                        categories={category.children}
                        readOnly={readOnly}
                    />
                </div>
            )}
        </Col>
    )
}

interface CategoriesTreeProps {
    value: string[]
    onChange: (value: string[]) => void
    readOnly: boolean
    categories: CategoryTreeNode[]
}

const CategoriesTree = (props: CategoriesTreeProps) => {
    const { categories, value, onChange, readOnly } = props

    return (
        <Col style={{ alignSelf: "stretch" }}>
            {categories.map((c) => (
                <CategoriesTreeItem
                    key={c.id}
                    category={c}
                    value={value}
                    onChange={onChange}
                    readOnly={readOnly}
                />
            ))}
        </Col>
    )
}

interface SelectCategoriesViewProps {
    value: string[]
    onChange: (value: string[]) => void
    categoryTree: CategoryTree
    readOnly: boolean
    onClose: () => void
}

const SelectCategoriesView = (props: SelectCategoriesViewProps) => {
    const { categoryTree, readOnly, onChange, onClose, value } = props

    const treeElem =
        categoryTree.nodes.length > 0 ? (
            <CategoriesTree
                categories={categoryTree.nodes}
                value={value}
                onChange={onChange}
                readOnly={readOnly}
            />
        ) : (
            <Row
                style={{ height: 60, color: "var(--color-secondary)" }}
                align="center"
                justify="center"
            >
                No categories
            </Row>
        )

    return (
        <Container
            title="Select categories"
            onClose={onClose}
            style={{ height: "100%" }}
            styles={{ content: { paddingBottom: 0 } }}
        >
            <LinkButton to="/categories">Manage categories</LinkButton>
            <div style={{ flexGrow: 1 }}>{treeElem}</div>
            <div
                style={{
                    position: "sticky",
                    bottom: 0,
                    width: "100%",
                    background: "var(--color-background)",
                    flexShrink: 0,
                    overflow: "scroll"
                }}
            >
                <CategoriesList
                    items={value.map((id) => categoryTree.map[id]!)}
                    readOnly={readOnly}
                    onRemove={(id) => onChange(without(value, id))}
                />
            </div>
        </Container>
    )
}

export { SelectCategoriesView }
