import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Row } from "oriente"

import { useStore } from "~/store"
import Container from "~/ui/Container"
import { LinkButton } from "~/ui"
import ButtonsGrid from "~/ui/ButtonsGrid"
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
                <LinkButton to="/account/image">Change image</LinkButton>
                <LinkButton to="/account/sessions">Active sessions</LinkButton>
            </ButtonsGrid>
        </Container>
    )
})

export default AccountSettingsView
