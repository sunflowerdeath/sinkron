import { observer } from 'mobx-react-lite'
import { Row } from 'oriente'

import moreHorizSvg from '@material-design-icons/svg/outlined/more_horiz.svg'

import { Menu, MenuItem } from "../ui/menu"
import { Button } from "../ui/button"
import { Icon } from "../ui/icon"
import Container from "../ui/Container"

import { useStore } from '../store'

type CategoriesListItemProps = {
    category: { name: string; count: number }
}

const CategoryListItem = (props: CategoriesListItemProps) => {
    const { category } = props
    const menu = () => (
        <>
            <MenuItem>Rename</MenuItem>
            <MenuItem>Move to another category</MenuItem>
            <MenuItem>Delete</MenuItem>
        </>
    )
    return (
        <Row align="center" gap={8} style={{ alignSelf: 'stretch' }}>
            <Row gap={8} style={{ flexGrow: 1 }}>
                <div>{category.name}</div>
                <div style={{ color: '#999' }}>{category.count}</div>
            </Row>
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
    )
}

const CategoriesView = observer(() => {
    const store = useStore()

    return (
        <Container title="Categories">
            <Row gap={8} style={{ height: 45 }}>
                <div>All documents</div>
                <div style={{ color: '#999' }}>2</div>
            </Row>
            <CategoryListItem category={{ name: 'Food', count: 2 }} />
            <CategoryListItem category={{ name: 'Wood', count: 22 }} />
        </Container>
    )
})

export default CategoriesView
