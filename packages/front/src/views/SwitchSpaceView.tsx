import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Col, Row } from "oriente"

import moreHorizSvg from "@material-design-icons/svg/outlined/more_horiz.svg"

import type { Space } from "~/entities"
import { useStore } from "~/store"
import { Button, LinkButton, Menu, MenuItem, Icon } from "~/ui"
import Container from "~/ui/Container"
import numForm from "~/utils/numForm"
import { Picture } from "~/components/picture"

const SwitchSpaceView = observer(() => {
    const store = useStore()
    const [_location, navigate] = useLocation()

    const select = (s: Space) => {
        store.changeSpace(s.id)
        navigate("/")
    }

    const menu = () => (
        <>
            <MenuItem onSelect={() => {}}>Move up</MenuItem>
            <MenuItem onSelect={() => {}}>Move down</MenuItem>
            <MenuItem onSelect={() => {}}>Leave space</MenuItem>
        </>
    )

    return (
        <Container title="Switch space" onClose={() => navigate("/")}>
            <Col gap={10} align="normal">
                {store.user.spaces.map((s) => (
                    <Row gap={8} key={s.id}>
                        <Button
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
                        <Menu
                            menu={menu}
                            styles={{ list: { background: "#555" } }}
                            placement={{ padding: 0, offset: 8, align: "end" }}
                            autoSelectFirstItem={false}
                        >
                            {(ref, { open }) => (
                                <Button onClick={open} ref={ref}>
                                    <Icon svg={moreHorizSvg} />
                                </Button>
                            )}
                        </Menu>
                    </Row>
                ))}
            </Col>
            <LinkButton to="/create-space">Create new space</LinkButton>
        </Container>
    )
})

export default SwitchSpaceView
