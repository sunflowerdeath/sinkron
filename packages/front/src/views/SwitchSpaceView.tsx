import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Col, Row } from "oriente"

import type { Space } from "~/entities"
import { useStore } from "~/store"
import { Button, LinkButton } from "~/ui"
import Container from "~/ui/Container"
import numForm from "~/utils/numForm"
import { Picture } from "~/components/picture"

const SwitchSpaceView = observer(() => {
    const userStore = useStore()
    const [_location, navigate] = useLocation()

    const select = (s: Space) => {
        userStore.changeSpace(s.id)
        navigate("/")
    }

    return (
        <Container title="Switch space" onClose={() => navigate("/")}>
            <Col gap={10} align="normal">
                {userStore.spaces.map((s) => (
                    <Button
                        key={s.id}
                        onClick={() => select(s)}
                        style={{ justifyContent: "start", flexGrow: 1 }}
                    >
                        <Row gap={8} align="center">
                            <Picture picture={s.picture} />
                            <Col>
                                <div>{s.name || "."}</div>
                                <div style={{ opacity: 0.6 }}>
                                    {numForm(s.membersCount, {
                                        one: "member",
                                        many: "members"
                                    })}{" "}
                                    &ndash; {s.role}
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
