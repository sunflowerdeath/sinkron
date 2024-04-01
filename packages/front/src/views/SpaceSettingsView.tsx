import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Col, useModal } from "oriente"

// import { useStore } from "../store"
import { Modal, Button } from "../ui"
import ButtonsGrid from "../ui/ButtonsGrid"
import Container from "../ui/Container"

const SpaceSettingsView = observer(() => {
    const [_location, navigate] = useLocation()
    // const store = useStore()

    const deleteModal = useModal({
        Component: Modal,
        width: 440,
        isCentered: true,
        children: (close) => {
            return (
                <Col gap={20}>
                    Are you sure you want to delete space "name"?
                    <ButtonsGrid>
                        <Button onClick={close}>Cancel</Button>
                        <Button>Delete</Button>
                    </ButtonsGrid>
                </Col>
            )
        }
    })

    return (
        <Container title="Space settings" onClose={() => navigate("/")}>
            <ButtonsGrid>
                <Button>Change image</Button>
                <Button>Change name</Button>
                <Button onClick={() => deleteModal.open()}>
                    Delete space
                </Button>
            </ButtonsGrid>
            {deleteModal}
        </Container>
    )
})

export default SpaceSettingsView
