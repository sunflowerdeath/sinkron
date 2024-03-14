import { observer } from "mobx-react-lite"
import { useLocation, Link } from "wouter"
import { ConnectionStatus } from "sinkron-client"
import { Col, Row, useModal } from "oriente"

import { Modal } from "../ui/modal"
import { Heading } from "../ui/heading"
import ButtonsGrid from "../ui/ButtonsGrid"
import { Avatar } from "../ui/avatar"
import { Button } from "../ui/button"
import Container from "../ui/Container"

import { useStore, useSpace } from "../store"

const statusMap = {
    [ConnectionStatus.Disconnected]: "Waiting for connection...",
    [ConnectionStatus.Connected]: "Connecting...",
    [ConnectionStatus.Sync]: "Receiving changes...",
    [ConnectionStatus.Ready]: "Connected"
}

const roleMap = {
    readonly: "Read-only",
    editor: "Editor",
    admin: "Admin",
    owner: "Owner"
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

    const role = space.space.role
    const canInvite = role === "admin" || role === "owner"

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
                    <Button onClick={() => store.logout()}>Log out</Button>
                </ButtonsGrid>
            </Col>
            <Col gap={16}>
                <Heading>Space</Heading>
                <Row gap={8}>
                    <Avatar name={space.space.name} />
                    <Col>
                        <div>{space.space.name}</div>
                        <div style={{ opacity: ".6" }}>
                            {space.space.membersCount} member &ndash;{" "}
                            {roleMap[role]}
                        </div>
                    </Col>
                </Row>
                <ButtonsGrid>
                    <Button as={Link} to="/space/members">
                        Members
                    </Button>
                    {canInvite && (
                        <Button as={Link} to="/space/invite">
                            Invite
                        </Button>
                    )}
                    {role === "owner" ? (
                        <>
                            <Button>Space settings</Button>
                            <Button onClick={() => deleteModal.open()}>
                                Delete space
                            </Button>
                        </>
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
