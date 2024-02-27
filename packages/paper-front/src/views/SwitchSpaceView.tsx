import { observer } from "mobx-react-lite"
import { useLocation, Link } from "wouter"
import { Col, Row } from "oriente"

import { useStore } from "../store"
import { Button } from "../ui/button"
import { Avatar } from "../ui/avatar"
import Container from "../ui/Container"

const SwitchSpaceView = observer(() => {
    const store = useStore()

    const [location, navigate] = useLocation()

    const select = (s: Space) => {
        store.space = s
        navigate('/')
    }

    return (
        <Container title="Switch space">
            <Col gap={10}>
                {store.user!.spaces.map((s) => (
                    <Button
                        onClick={() => select(s)}
                        style={{ width: 400, justifyContent: 'start' }}
                    >
                        <Row gap={8} align="center">
                            <Avatar name={s.name} />
                            <Col>
                                <div>{s.name || '.'}</div>
                                <div style={{ opacity: 0.6 }}>
                                    {s.membersCount} members &ndash; {s.role}
                                </div>
                            </Col>
                        </Row>
                    </Button>
                ))}
            </Col>
            <Button as={Link} to="/create-space" style={{ width: 400 }}>
                Create new space
            </Button>
        </Container>
    )
})

export default SwitchSpaceView
