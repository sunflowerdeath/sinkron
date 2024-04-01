import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Col, Row } from "oriente"

import type { Space } from "../entities"
import { useStore } from "../store"
import { Button, LinkButton, Avatar } from "../ui"
import Container from "../ui/Container"

const SwitchSpaceView = observer(() => {
    const store = useStore()
    const [_location, navigate] = useLocation()

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
            <LinkButton to="/create-space">Create new space</LinkButton>
        </Container>
    )
})

export default SwitchSpaceView
