import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Row } from "oriente"

import { useStore } from "../store"
import Container from "../ui/Container"
import { Button, LinkButton, Avatar } from "../ui"
import ButtonsGrid from "../ui/ButtonsGrid"

const AccountSettingsView = observer(() => {
    const [_location, navigate] = useLocation()
    const store = useStore()
    return (
        <Container title="Account settings" onClose={() => navigate("/")}>
            <Row gap={8} align="center">
                <Avatar name={store.user!.name} />
                <div>{store.user!.name}</div>
            </Row>
            <ButtonsGrid>
                <Button>Change image</Button>
                <Button>Change password</Button>
                <LinkButton to="/account/sessions">Active sessions</LinkButton>
            </ButtonsGrid>
        </Container>
    )
})

export default AccountSettingsView
