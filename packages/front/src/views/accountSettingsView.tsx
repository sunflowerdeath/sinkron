import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Row } from "oriente"

import { useStore } from "~/store"
import { LinkButton, Container, ButtonsGrid } from "~/ui"
import { Picture } from "~/components/picture"

const AccountSettingsView = observer(() => {
    const [_location, navigate] = useLocation()
    const store = useStore()
    return (
        <Container title="Account settings" onClose={() => navigate("/")}>
            <Row gap={8} align="center">
                <Picture picture={store.user!.picture} />
                <div>{store.user!.email}</div>
            </Row>
            <ButtonsGrid>
                <LinkButton to="/account/picture">Change picture</LinkButton>
                <LinkButton to="/account/sessions">Active sessions</LinkButton>
            </ButtonsGrid>
        </Container>
    )
})

export { AccountSettingsView }
