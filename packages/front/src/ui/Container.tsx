import { useMedia } from 'react-use'
import { Col, Row } from 'oriente'

import arrowBackSvg from '@material-design-icons/svg/outlined/arrow_back.svg'
import closeSvg from '@material-design-icons/svg/outlined/close.svg'

import { Button } from '../ui/button'
import { Icon } from '../ui/icon'
import { Heading } from '../ui/heading'

interface ContainerProps {
    children: React.ReactNode
    title: React.ReactNode
    onClose: () => void
}

const Container = (props: ContainerProps) => {
    const { children, title, onClose } = props

    const isMobile = useMedia('(max-width: 1023px)')

    const heading = isMobile ? (
        <Row style={{ height: 60, flexShrink: 0 }} gap={8} align="center">
            <Button onClick={onClose}>
                <Icon svg={arrowBackSvg} />
            </Button>
            {title && <Heading style={{ flexGrow: 1 }}>{title}</Heading>}
        </Row>
    ) : (
        <Row
            style={{
                height: 60,
                paddingLeft: 40,
                position: 'absolute',
                top: 0,
                width: '100%',
                background: 'var(--color-background)',
                boxSizing: 'border-box'
            }}
            gap={8}
            align="center"
        >
            {title && <Heading style={{ flexGrow: 1 }}>{title}</Heading>}
            <Button onClick={onClose}>
                <Icon svg={closeSvg} />
            </Button>
        </Row>
    )

    return (
        <div
            style={{
                maxWidth: 480,
                borderRight: isMobile ? 'none' : '2px solid #555',
                height: '100%',
                position: 'relative'
            }}
        >
            {heading}
            <Col
                gap={16}
                align="normal"
                style={{
                    padding: isMobile ? '0 10px' : '0 40px',
                    paddingTop: 80,
                    overflow: 'auto',
                    paddingBottom: 20,
                    boxSizing: 'border-box',
                    height: '100%'
                }}
            >
                {children}
            </Col>
        </div>
    )
}

export default Container
