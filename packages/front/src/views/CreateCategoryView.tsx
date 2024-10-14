import { useState } from "react"
import { observer } from "mobx-react-lite"
import { useLocation, useSearch } from "wouter"
import queryString from "query-string"
import { Col, Row } from "oriente"

import closeSvg from "@material-design-icons/svg/outlined/close.svg"
import expandMoreSvg from "@material-design-icons/svg/outlined/expand_more.svg"

import { useSpace } from "~/store"
import type { CategoryTree, CategoryTreeNode } from "~/store/SpaceStore"
import { Input, Button, Icon, Menu, MenuItem } from "~/ui"
import Container from "~/ui/Container"

const renderNode = (c: CategoryTreeNode, props: CategorySelectProps) => {
    const { disabledItems, onChange } = props
    const children = c.children.length > 0 && (
        <div style={{ paddingLeft: 30 }}>
            {c.children.map((child) => renderNode(child, props))}
        </div>
    )
    return (
        <>
            <MenuItem
                value={c.id}
                key={c.id}
                onSelect={() => onChange(c.id)}
                isDisabled={disabledItems.includes(c.id)}
                style={{ whiteSpace: "nowrap", overflow: "hidden" }}
            >
                {c.name}
            </MenuItem>
            {children}
        </>
    )
}

interface CategorySelectProps {
    value: string | null
    onChange: (value: string | null) => void
    categoryTree: CategoryTree
    disabledItems: string[]
}

const CategorySelect = (props: CategorySelectProps) => {
    const { categoryTree, value, onChange } = props
    const menu = () => {
        return categoryTree.nodes.length === 0 ? (
            <Row style={{ color: "#999", height: 45 }} align="center">
                No categories
            </Row>
        ) : (
            categoryTree.nodes.map((c) => renderNode(c, props))
        )
    }
    return (
        <Menu
            menu={menu}
            matchWidth
            autoSelectFirstItem={false}
            maxHeight={240}
            placement={{ padding: 8 }}
            styles={{ list: { overflowX: "hidden" } }}
        >
            {(ref, { open }) => (
                <Row
                    style={{
                        height: 60,
                        border: "2px solid #999",
                        padding: "0 8px",
                        alignSelf: "normal",
                        boxSizing: "border-box"
                    }}
                    align="center"
                    ref={ref}
                    onClick={open}
                    gap={8}
                >
                    <div
                        style={{
                            flexGrow: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                        }}
                    >
                        {value ? (
                            categoryTree.map[value].name
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
    categoryTree: CategoryTree
    submitButtonText: React.ReactNode
    onSubmit: (values: { name: string; parent: string | null }) => void
}

const EditCategoryForm = (props: EditCategoryFormProps) => {
    const {
        initialValues,
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
                Name
                <Input value={name} onChange={(value) => setName(value)} />
            </Col>
            <Col gap={8}>
                Parent category
                <CategorySelect
                    disabledItems={disabledItems}
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

    const spaceStore = useSpace()
    const [_location, navigate] = useLocation()

    const create = (values: { name: string; parent: string | null }) => {
        const id = spaceStore.createCategory(values)
        spaceStore.view = { kind: "category", id }
        navigate("/")
    }

    if (!spaceStore.collection.initialSyncCompleted) {
        return "Loading..."
    }

    return (
        <Container title="Create category" onClose={() => navigate("/")}>
            <EditCategoryForm
                initialValues={{ name: "", parent: initialParent }}
                onSubmit={create}
                submitButtonText="Create"
                categoryTree={spaceStore.categoryTree}
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

    const spaceStore = useSpace()
    const [_location, navigate] = useLocation()

    if (!spaceStore.collection.initialSyncCompleted) {
        return "Loading..."
    }

    const category = spaceStore.meta.categories[id]
    const update = async (values: { name: string; parent: string | null }) => {
        spaceStore.updateCategory(id, values)
        navigate("/categories")
    }

    return (
        <Container title="Edit category" onClose={() => navigate("/")}>
            <EditCategoryForm
                initialValues={category}
                onSubmit={update}
                submitButtonText="Save"
                categoryTree={spaceStore.categoryTree}
                disabledItems={[id]}
            />
        </Container>
    )
})

export { EditCategoryView, CreateCategoryView }
