import { useState } from "react"
import { Link } from "wouter"
import { Col, Row } from "oriente"
import { without } from "lodash-es"

import { Button } from "../ui/button"
import { Icon } from "../ui/icon"
import Container from "../ui/Container"
import ButtonsGrid from "../ui/ButtonsGrid"

import CategoriesList from "../components/CategoriesList"

import checkBoxSvg from "@material-design-icons/svg/outlined/check_box.svg"
import checkBoxOutlineSvg from "@material-design-icons/svg/outlined/check_box_outline_blank.svg"

import { Category, TreeNode } from "../store"

interface CategoriesTreeItemProps {
    value: string[]
    onChange: (value: string[]) => void
    category: TreeNode<Category>
}

const CategoriesTreeItem = (props: CategoriesTreeItemProps) => {
    const { category, value, onChange } = props
    const hasChildren = category.children !== undefined

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
                        flexShrink: 1
                    }}
                    onClick={() => {
                        const nextValue = isSelected
                            ? without(value, category.id)
                            : [...value, category.id]
                        onChange(nextValue)
                    }}
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
            <div style={{ marginLeft: 32, alignSelf: "stretch" }}>
                {hasChildren && (
                    <CategoriesTree
                        value={value}
                        onChange={onChange}
                        categories={category.children}
                    />
                )}
            </div>
        </Col>
    )
}

interface CategoriesTreeProps {
    value: string[]
    onChange: (value: string[]) => void
    categories: TreeNode<Category>[]
}

const CategoriesTree = (props: CategoriesTreeProps) => {
    const { categories, value, onChange } = props

    return (
        <Col style={{ alignSelf: "stretch" }}>
            {categories.map((c) => (
                <CategoriesTreeItem
                    category={c}
                    value={value}
                    onChange={onChange}
                />
            ))}
        </Col>
    )
}

interface SelectCategoriesViewProps {
    value: string[]
    onChange: (value: string[]) => void
    tree: TreeNode<Category>[]
    categories: { [key: string]: Category }
    onClose: () => void
}

const SelectCategoriesView = (props: SelectCategoriesViewProps) => {
    const { categories, onChange, onClose, value, tree } = props

    const treeElem =
        tree.length > 0 ? (
            <CategoriesTree
                categories={tree}
                value={value}
                onChange={onChange}
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
            <Button as={Link} to="/categories">
                Manage categories
            </Button>
            <div style={{ flexGrow: 1, paddingBottom: 20 }}>{treeElem}</div>
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
                    items={value.map((id) => categories[id]!)}
                    onRemove={(id) => onChange(without(value, id))}
                />
            </div>
        </Container>
    )
}

export default SelectCategoriesView
