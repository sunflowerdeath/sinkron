import { useState } from "react"
import { observer } from "mobx-react-lite"
import { useLocation, useSearch } from "wouter"
import queryString from "query-string"
import { Col, Row } from "oriente"

import closeSvg from "@material-design-icons/svg/outlined/close.svg"
import expandMoreSvg from "@material-design-icons/svg/outlined/expand_more.svg"

import { useSpace } from "../store"
import type { Category, Tree } from "../store"

import { Input } from "../ui/input"
import { Button } from "../ui/button"
import { Icon } from "../ui/icon"
import Container from "../ui/Container"
import { Menu, MenuItem } from "../ui/menu"

const renderItems = (props: CategorySelectProps) => {
    const { categoryTree, disabledItems, onChange } = props
    return categoryTree.map((c) => (
        <>
            <MenuItem
                value={c.id}
                key={c.id}
                onSelect={() => onChange(c.id)}
                isDisabled={disabledItems.includes(c.id)}
            >
                {c.name}
            </MenuItem>
            {c.children && (
                <div style={{ paddingLeft: 30 }}>
                    {renderItems({ ...props, categoryTree: c.children })}
                </div>
            )}
        </>
    ))
}

interface CategorySelectProps {
    value: string | null
    onChange: (value: string | null) => void
    categoryMap: { [key: string]: Category }
    categoryTree: Tree<Category>
    disabledItems: string[]
}

const CategorySelect = (props: CategorySelectProps) => {
    const { categoryTree, categoryMap, value, onChange } = props
    const menu = () => {
        return categoryTree.length === 0 ? (
            <Row style={{ color: "#999", height: 45 }} align="center">
                No categories
            </Row>
        ) : (
            renderItems(props)
        )
    }
    return (
        <Menu
            menu={menu}
            matchWidth
            autoSelectFirstItem={false}
            maxHeight={240}
        >
            {(ref, { open }) => (
                <Row
                    style={{
                        height: 60,
                        border: "2px solid #999",
                        padding: "0 8px",
                        alignSelf: "normal"
                    }}
                    align="center"
                    ref={ref}
                    onClick={open}
                    gap={8}
                >
                    <div style={{ flexGrow: 1 }}>
                        {value ? (
                            categoryMap[value].name
                        ) : (
                            <div style={{ color: "#999" }}>No parent</div>
                        )}
                    </div>
                    {value ? (
                        <Button size="s" onClick={() => onChange(null)}>
                            <Icon svg={closeSvg} />
                        </Button>
                    ) : (
                        <Icon svg={expandMoreSvg} />
                    )}
                </Row>
            )}
        </Menu>
    )
}

interface EditCategoryFormProps {
    initialValues?: { name: string; parent: string | null }
    disabledItems: string[]
    categoryMap: { [key: string]: Category }
    categoryTree: Tree<Category>
    submitButtonText: React.ReactNode
    onSubmit: (values: { name: string; parent: string | null }) => void
}

const EditCategoryForm = (props: EditCategoryFormProps) => {
    const {
        initialValues,
        categoryMap,
        categoryTree,
        disabledItems,
        onSubmit,
        submitButtonText
    } = props

    const [name, setName] = useState(initialValues?.name || "")
    const [parent, setParent] = useState<string | null>(
        initialValues?.parent || null
    )

    const isValid = name.length > 0

    return (
        <>
            <Col gap={8} style={{ alignSelf: "stretch" }} align="normal">
                Name:
                <Input
                    style={{ maxWidth: 400 }}
                    value={name}
                    onChange={(value) => setName(value)}
                />
            </Col>
            <Col gap={8}>
                Parent category:
                <CategorySelect
                    disabledItems={disabledItems}
                    categoryMap={categoryMap}
                    categoryTree={categoryTree}
                    value={parent}
                    onChange={setParent}
                />
            </Col>
            <Button
                onClick={() => onSubmit({ name, parent })}
                isDisabled={!isValid}
            >
                {submitButtonText}
            </Button>
        </>
    )
}

const CreateCategoryView = observer(() => {
    const search = queryString.parse(useSearch())
    const initialParent =
        "parent" in search
            ? Array.isArray(search.parent)
                ? search.parent[0]
                : search.parent
            : null

    const space = useSpace()
    const [location, navigate] = useLocation()

    const create = (values: { name: string; parent: string | null }) => {
        const id = space.createCategory(values)
        space.selectCategory(id)
        navigate("/")
    }

    if (!space.collection.initialSyncCompleted) {
        return "Loading..."
    }

    return (
        <Container title="Create category" onClose={() => navigate("/")}>
            <EditCategoryForm
                initialValues={{ name: "", parent: initialParent }}
                onSubmit={create}
                submitButtonText="Create"
                categoryMap={space.categoryMap}
                categoryTree={space.categoryTree}
                disabledItems={[]}
            />
        </Container>
    )
})

interface EditCategoryViewProps {
    id: string
}

const EditCategoryView = observer((props: EditCategoryViewProps) => {
    const { id } = props

    const space = useSpace()
    const [location, navigate] = useLocation()

    if (!space.collection.initialSyncCompleted) {
        return "Loading..."
    }

    const category = space.meta.categories[id]
    const update = async (values: { name: string; parent: string | null }) => {
        await space.updateCategory(id, values)
        navigate("/categories")
    }

    return (
        <Container title="Edit category" onClose={() => navigate("/")}>
            <EditCategoryForm
                initialValues={category}
                onSubmit={update}
                submitButtonText="Save"
                categoryMap={space.categoryMap}
                categoryTree={space.categoryTree}
                disabledItems={[id]}
            />
        </Container>
    )
})

export { EditCategoryView, CreateCategoryView }
