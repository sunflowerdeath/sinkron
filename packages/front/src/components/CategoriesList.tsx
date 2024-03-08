import { Row } from 'oriente'

import closeSvg from '@material-design-icons/svg/outlined/close.svg'

import { Button } from '../ui/button'
import { Icon } from '../ui/icon'

interface CategoriesListProps {
    items: { id: string; name: string }[]
    onRemove: (id: string) => void
}

const CategoriesList = (props: CategoriesListProps) => {
    const { items, onRemove } = props

    return (
        <Row gap={8} style={{ height: 60, flexShrink: 0 }} align="center">
            {items.map((item) => (
                <Row
                    align="center"
                    style={{ background: '#444' }}
                    key={item.id}
                >
                    <div style={{ padding: '0 8px' }}>{item.name}</div>
                    <Button
                        kind="transparent"
                        size="s"
                        onClick={() => onRemove(item.id)}
                    >
                        <Icon svg={closeSvg} />
                    </Button>
                </Row>
            ))}
        </Row>
    )
}

export default CategoriesList
