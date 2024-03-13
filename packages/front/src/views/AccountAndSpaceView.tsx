import { observer } from "mobx-react-lite"
import { useLocation, Link } from "wouter"

import { Col, Row, useModal } from "oriente"
import { Modal } from "../ui/modal"
import { Heading } from "../ui/heading"
import ButtonsGrid from "../ui/ButtonsGrid"
import { Avatar } from "../ui/avatar"
import { Button } from "../ui/button"
import Container from "../ui/Container"

import { useStore, useSpace } from "../store"

import { ConnectionStatus } from "sinkron-client"

const statusMap = {
    [ConnectionStatus.Disconnected]: "Waiting for connection...",
    [ConnectionStatus.Connected]: "Connecting...",
    [ConnectionStatus.Sync]: "Receiving changes...",
    [ConnectionStatus.Ready]: "Connected"
}

const AccountAndSpaceView = observer(() => {
    const store = useStore()
    const space = useSpace()

    const [location, navigate] = useLocation()

    const leaveModal = useModal({
        Component: Modal,
        width: 440,
        isCentered: true,
        children: (close) => {
            return (
                <Col gap={20}>
                    Are you sure you want to leave space "name"?
                    <ButtonsGrid>
                        <Button onClick={close}>Cancel</Button>
                        <Button>Leave</Button>
                    </ButtonsGrid>
                </Col>
            )
        }
    })

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
                        <Button>DELETE</Button>
                    </ButtonsGrid>
                </Col>
            )
        }
    })

    const isOwner = store.user.id === space.space.owner.id

    const roleText = isOwner ? "Owner" : space.space.role

    const status = (
        <div style={{ color: "var(--color-secondary)" }}>
            Connection: {statusMap[space.collection.status]}
        </div>
    )

    return (
        <Container title="Account and spaces" onClose={() => navigate("/")}>
            <Col gap={16}>
                <Heading>Account</Heading>
                <Row gap={8} align="center">
                    <Avatar name={store.user!.name} />
                    <div>{store.user!.name}</div>
                </Row>
                <ButtonsGrid>
                    <Button as={Link} to="/account/settings">
                        Account settings
                    </Button>
                    <Button onClick={() => store.logout()}>Log Out</Button>
                </ButtonsGrid>
            </Col>
            <Col gap={16}>
                <Heading>Space</Heading>
                <Row gap={8}>
                    <Avatar name={space.space.name} />
                    <Col>
                        <div>{space.space.name}</div>
                        <div style={{ opacity: ".6" }}>
                            {space.space.membersCount} member &ndash; {roleText}
                        </div>
                    </Col>
                </Row>
                <ButtonsGrid>
                    <Button as={Link} to="/space/members">
                        Members
                    </Button>
                    <Button as={Link} to="/space/invite">
                        Invite
                    </Button>
                    <Button>Space settings</Button>
                    {isOwner ? (
                        <Button onClick={() => deleteModal.open()}>
                            Delete space
                        </Button>
                    ) : (
                        <Button onClick={() => leaveModal.open()}>
                            Leave space
                        </Button>
                    )}
                </ButtonsGrid>
            </Col>
            <ButtonsGrid>
                <Button as={Link} to="/switch-space">
                    Switch space
                </Button>
                <Button as={Link} to="/create-space">
                    Create space
                </Button>
            </ButtonsGrid>
            {status}
            {leaveModal.render()}
            {deleteModal.render()}
        </Container>
    )
})

export default AccountAndSpaceView
