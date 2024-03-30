import { observer } from "mobx-react-lite"
import { useLocation, Link } from "wouter"
import { Col, Row } from "oriente"

import type { Space } from "../entities"
import { useStore } from "../store"
import { Button, Avatar } from "../ui"
import Container from "../ui/Container"

const SwitchSpaceView = observer(() => {
    const store = useStore()
    const [location, navigate] = useLocation()

    const select = (s: Space) => {
        store.changeSpace(s.id)
        navigate("/")
    }

    return (
        <Container title="Switch space" onClose={() => navigate("/")}>
            <Col gap={10} align="normal">
                {store.user.spaces.map((s) => (
                    <Button
                        onClick={() => select(s)}
                        style={{ justifyContent: "start" }}
                        key={s.id}
                    >
                        <Row gap={8} align="center">
                            <Avatar name={s.name} />
                            <Col>
                                <div>{s.name || "."}</div>
                                <div style={{ opacity: 0.6 }}>
                                    {s.membersCount} members &ndash; {s.role}
                                </div>
                            </Col>
                        </Row>
                    </Button>
                ))}
            </Col>
            <Button as={Link} to="/create-space">
                Create new space
            </Button>
        </Container>
    )
})

export default SwitchSpaceView
