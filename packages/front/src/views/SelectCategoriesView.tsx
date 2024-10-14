import { Col, Row } from "oriente"
import { without } from "lodash-es"

import checkBoxSvg from "@material-design-icons/svg/outlined/check_box.svg"
import checkBoxOutlineSvg from "@material-design-icons/svg/outlined/check_box_outline_blank.svg"

import { LinkButton, Button, Icon } from "../ui"
import Container from "../ui/Container"
import CategoriesList from "../components/CategoriesList"
import type { CategoryTree, CategoryTreeNode } from "../store/SpaceStore"

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
            </Row>
            {hasChildren && (
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

export default SelectCategoriesView
