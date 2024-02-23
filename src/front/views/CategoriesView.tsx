import { observer } from 'mobx-react-lite'
import { Col, Row } from 'oriente'
import { Link, useLocation } from 'wouter'

import moreHorizSvg from '@material-design-icons/svg/outlined/more_horiz.svg'
import arrowDownSvg from '@material-design-icons/svg/outlined/expand_more.svg'

import { Menu, MenuItem } from '../ui/menu'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { Heading } from '../ui/heading'

import { useStore, Category, TreeNode } from '../store'

type CategoriesListItemProps = {
    category: TreeNode<Category>
    onDelete: (id: string) => void
    onSelect: (id: string) => void
}

const CategoryListItem = (props: CategoriesListItemProps) => {
    const { category, onSelect, onDelete } = props
    const hasChildren = category.children !== undefined
    const menu = () => (
        <>
            <MenuItem>Create subcategory</MenuItem>
            <MenuItem>Rename</MenuItem>
            <MenuItem>Move to another category</MenuItem>
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
            {category.children && (
                <CategoryList
                    categories={category.children}
                    onSelect={onSelect}
                    onDelete={onDelete}
                />
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
    const spaceStore = store.spaceStore!

    const [location, navigate] = useLocation()

    const onDelete = (id: string) => {
        store.spaceStore!.deleteCategory(id)
    }

    const selectCategory = (id: string | null) => {
        spaceStore.currentCategoryId = id
        navigate('/')
    }

    let list
    if (store.spaceStore!.collection.initialSyncCompleted) {
        list = (
            <>
                <Button
                    style={{ alignSelf: 'normal' }}
                    as={Link}
                    to="/create-category"
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
                        categories={store.spaceStore!.categories}
                        onDelete={onDelete}
                        onSelect={(id) => selectCategory(id)}
                    />
                </Col>
            </>
        )
    } else {
        list = 'Loading...'
    }

    return (
        <Col
            gap={20}
            style={{
                padding: '0 40px',
                maxWidth: 480,
                boxSizing: 'border-box'
            }}
        >
            <div style={{ height: 60, alignItems: 'center', display: 'flex' }}>
                <Heading>Categories</Heading>
            </div>
            {list}
        </Col>
    )
})

export default CategoriesView
