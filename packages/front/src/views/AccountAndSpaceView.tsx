import { useState } from "react"
import { observer } from "mobx-react-lite"
import { useLocation, Link } from "wouter"
import { fromPromise } from "mobx-utils"
import { ConnectionStatus } from "sinkron-client"
import { Col, Row, useModal } from "oriente"

import { Modal } from "../ui/modal"
import { Heading } from "../ui/heading"
import ButtonsGrid from "../ui/ButtonsGrid"
import { Avatar } from "../ui/avatar"
import { Button } from "../ui/button"
import Container from "../ui/Container"
import { Toast, useToast } from "../ui/toast"

import { useStore, useSpace } from "../store"

const statusMap = {
    [ConnectionStatus.Disconnected]: "Waiting for connection...",
    [ConnectionStatus.Connected]: "Connecting...",
    [ConnectionStatus.Sync]: "Receiving changes...",
    [ConnectionStatus.Ready]: "Connected to server"
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
    const toast = useToast()

    const [leaveState, setLeaveState] = useState()
    const leave = () => {
        const state = fromPromise(store.leaveSpace())
        const name = space.space.name
        setLeaveState(state)
        state
            .then(() => {
                toast.show({
                    children: <Toast>You have left the space "{name}"</Toast>
                })
                navigate("/")
            })
            .catch(() => {
                toast.show({
                    children: (
                        <Toast variant="error">
                            Couldn't perform an operation
                        </Toast>
                    )
                })
            })
    }

    const leaveModal = useModal({
        Component: Modal,
        width: 400,
        isCentered: true,
        children: (close) => {
            return (
                <Col gap={16}>
                    <Heading>Leave space</Heading>
                    Are you sure you want to leave space "{space.space.name}"?
                    <ButtonsGrid>
                        <Button onClick={close}>Cancel</Button>
                        <Button onClick={leave}>Leave</Button>
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
            {statusMap[space.collection.status]}
        </div>
    )

    const content = (
        <Col gap={16} align="normal" style={{ flexGrow: 1 }}>
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
        </Col>
    )

    return (
        <Container title="Account and spaces" onClose={() => navigate("/")}>
            {content}
            {status}
            {leaveModal.render()}
            {deleteModal.render()}
        </Container>
    )
})

export default AccountAndSpaceView
