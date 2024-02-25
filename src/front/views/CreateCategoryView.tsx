import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useLocation } from 'wouter'
import { Col, Row } from 'oriente'

import closeSvg from '@material-design-icons/svg/outlined/close.svg'
import expandMoreSvg from '@material-design-icons/svg/outlined/expand_more.svg'

import { useStore } from '../store'
import { TreeNode, Category } from '../store'

import { Input } from '../ui/input'
import { Heading } from '../ui/heading'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import Container from '../ui/Container'
import { Menu, MenuItem } from '../ui/menu'

const render = (
    categories: TreeNode<Category>[],
    onSelect: (c: Category) => void
) => {
    return categories.map((c) => (
        <>
            <MenuItem value={c.id} key={c.id} onSelect={() => onSelect(c)}>
                {c.name}
            </MenuItem>
            {c.children && (
                <div style={{ paddingLeft: 30 }}>
                    {render(c.children, onSelect)}
                </div>
            )}
        </>
    ))
}

interface CategorySelectProps {
    categories: TreeNode<Category>[]
    value: Category | undefined
    onChange: (value: Category | undefined) => void
}

const CategorySelect = (props: CategorySelectProps) => {
    const { categories, value, onChange } = props
    const menu = () => {
        return (
            <div style={{ background: '#555', padding: 8 }}>
                {render(categories, onChange)}
            </div>
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
                        border: '2px solid #999',
                        padding: '0 8px',
                        alignSelf: 'normal'
                    }}
                    align="center"
                    ref={ref}
                    onClick={open}
                    gap={8}
                >
                    <div style={{ flexGrow: 1 }}>
                        {value ? (
                            value.name
                        ) : (
                            <div style={{ color: '#999' }}>No parent</div>
                        )}
                    </div>
                    {value ? (
                        <Button size="s" onClick={() => onChange(undefined)}>
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
    category?: Category
    categoriesTree: TreeNode<Category>[]
    submitButtonText: React.ReactNode
    onSubmit: (values: { name: string; parent: string | null }) => void
}

const EditCategoryForm = (props: EditCategoryFormProps) => {
    const { category, categoriesTree, onSubmit, submitButtonText } = props
    const [name, setName] = useState(category?.name || '')
    const [parentCategory, setParentCategory] = useState<Category>()

    return (
        <>
            <Col gap={8} style={{ alignSelf: 'stretch' }} align="normal">
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
                    categories={categoriesTree}
                    value={parentCategory}
                    onChange={setParentCategory}
                />
            </Col>
            <Button
                onClick={() =>
                    onSubmit({ name, parent: parentCategory?.id || null })
                }
            >
                {submitButtonText}
            </Button>
        </>
    )
}

const CreateCategoryView = observer(() => {
    const store = useStore()
    const [location, navigate] = useLocation()

    const [name, setName] = useState('')
    const [parentCategory, setParentCategory] = useState<Category>()
    const create = () => {
        const id = store.space.createCategory(name, parentCategory?.id)
        store.space.selectCategory(id)
        navigate('/')
    }

    if (!store.space.collection.initialSyncCompleted) {
        return 'Loading...'
    }

    return (
        <Container title="New category" onClose={() => navigate('/')}>
            <Col gap={8} style={{ alignSelf: 'stretch' }} align="normal">
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
                    categories={store.space.categoriesTree}
                    value={parentCategory}
                    onChange={setParentCategory}
                />
            </Col>
            <Button onClick={create}>Create</Button>
        </Container>
    )
})

interface EditCategoryViewProps {
    id: string
}

const EditCategoryView = observer((props: EditCategoryViewProps) => {
    const { id } = props

    const store = useStore()
    const [location, navigate] = useLocation()

    if (!store.space.collection.initialSyncCompleted) {
        return 'Loading...'
    }

    const category = store.space.meta.categories[id]
    const update = async (values: { name: string; parent: string | null }) => {
        await store.space.updateCategory(id, values)
        navigate('/categories')
    }

    return (
        <Container title="Edit category" onClose={() => navigate('/')}>
            <EditCategoryForm
                category={category}
                onSubmit={update}
                submitButtonText="Save"
                categoriesTree={store.space.categoriesTree}
            />
        </Container>
    )
})

export { EditCategoryView, CreateCategoryView }
