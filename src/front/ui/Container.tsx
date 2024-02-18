import { useLocation } from "wouter"

import { Col, Row } from "oriente"

import closeSvg from '@material-design-icons/svg/outlined/close.svg'

import { Heading } from "./heading"
import { Button } from "./button"
import { Icon } from "./icon"

interface ContainerProps {
    title: React.ReactNode
    children: React.ReactNode
}

const Container = (props: ContainerProps) => {
    const [location, navigate] = useLocation()
    return (
        <Col
            gap={40}
            style={{
                paddingLeft: '40px',
                boxSizing: 'border-box',
                maxWidth: 480,
                borderRight: '2px solid #555',
                height: '100vh'
            }}
        >
            <Row style={{ height: 60, alignSelf: 'stretch' }} align="center">
                <Heading style={{ flexGrow: 1 }}>{props.title}</Heading>
                <Button onClick={() => navigate('/')}>
                    <Icon svg={closeSvg} />
                </Button>
            </Row>
            <Col gap={20} style={{ paddingRight: 40, alignSelf: 'stretch' }}>
                {props.children}
            </Col>
        </Col>
    )
}

export default Container
