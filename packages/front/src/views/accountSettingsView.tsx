import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Row } from "oriente"

import { useUserStore } from "~/store"
import { LinkButton, Container, ButtonsGrid } from "~/ui"
import { Picture } from "~/components/picture"

const AccountSettingsView = observer(() => {
    const [_location, navigate] = useLocation()
    const userStore = useUserStore()
    return (
        <Container title="Account settings" onClose={() => navigate("/")}>
            <Row gap={8} align="center">
                <Picture picture={userStore.user.picture} />
                <div>{userStore.user.email}</div>
            </Row>
            <ButtonsGrid>
                <LinkButton to="/account/picture">Change picture</LinkButton>
                <LinkButton to="/account/sessions">Active sessions</LinkButton>
            </ButtonsGrid>
        </Container>
    )
})

export { AccountSettingsView }
