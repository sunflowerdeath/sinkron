import { observer } from 'mobx-react-lite'
import { Col, Row } from 'oriente'
import { Link, useLocation } from 'wouter'

import moreHorizSvg from '@material-design-icons/svg/outlined/more_horiz.svg'
import arrowDownSvg from '@material-design-icons/svg/outlined/expand_more.svg'
import arrowBackSvg from '@material-design-icons/svg/outlined/arrow_back.svg'
import closeSvg from '@material-design-icons/svg/outlined/close.svg'

import { Menu, MenuItem } from '../ui/menu'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { Heading } from '../ui/heading'
import Container from '../ui/Container'

import { useStore, Category, TreeNode } from '../store'

type CategoriesListItemProps = {
    category: TreeNode<Category>
    onDelete: (id: string) => void
    onSelect: (id: string) => void
}

const CategoryListItem = (props: CategoriesListItemProps) => {
    const { category, onSelect, onDelete } = props

    const [location, navigate] = useLocation()

    const hasChildren = category.children !== undefined
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
            <Row align="center" gap={8} style={{ alignSelf: 'stretch' }}>
                <Button
                    style={{ flexGrow: 1, justifyContent: 'start' }}
                    kind="transparent"
                    onClick={() => onSelect(category.id)}
                >
                    <Row gap={8}>
                        <div>{category.name}</div>
                        <div style={{ color: '#999' }}>{category.count}</div>
                    </Row>
                </Button>
                <Menu
                    menu={menu}
                    styles={{ list: { background: '#555' } }}
                    placement={{ padding: 0, offset: 8, align: 'end' }}
                    autoSelectFirstItem={false}
                >
                    {(ref, { open }) => (
                        <Button onClick={open} ref={ref}>
                            <Icon svg={moreHorizSvg} />
                        </Button>
                    )}
                </Menu>
            </Row>
            {category.children.length > 0 && (
                <Col style={{ marginLeft: 32, alignSelf: 'normal' }}>
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
        <Col style={{ alignSelf: 'stretch' }} gap={8}>
            {categories.map((c) => (
                <CategoryListItem
                    category={c}
                    onSelect={onSelect}
                    onDelete={onDelete}
                />
            ))}
        </Col>
    )
}

const CategoriesView = observer(() => {
    const store = useStore()

    const [location, navigate] = useLocation()

    const onDelete = (id: string) => {
        store.space.deleteCategory(id)
    }

    const selectCategory = (id: string | null) => {
        store.space.selectCategory(id)
        navigate('/')
    }

    let list
    if (store.space.collection.initialSyncCompleted) {
        list = (
            <Col gap={8}>
                <Button
                    style={{ alignSelf: 'normal' }}
                    as={Link}
                    to="/categories/new"
                >
                    Create category
                </Button>
                <Col gap={8} style={{ alignSelf: 'stretch' }}>
                    <Button
                        style={{ alignSelf: 'normal', justifyContent: 'start' }}
                        kind="transparent"
                        onClick={() => selectCategory(null)}
                    >
                        <Row gap={8} align="center">
                            <div>All documents</div>
                            <div style={{ color: '#999' }}>2</div>
                        </Row>
                    </Button>
                    <CategoryList
                        categories={store.space.categoryTree}
                        onDelete={onDelete}
                        onSelect={(id) => selectCategory(id)}
                    />
                </Col>
            </Col>
        )
    } else {
        list = 'Loading...'
    }

    return (
        <Container title="Categories" onClose={() => navigate('/')}>
            {list}
        </Container>
    )
})

export default CategoriesView
