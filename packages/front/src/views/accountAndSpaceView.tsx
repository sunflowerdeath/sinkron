import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { fromPromise } from "mobx-utils"
import { ConnectionStatus } from "@sinkron/client/lib/collection"
import { Col, Row, useModal } from "oriente"

import { spaceRoleMap } from "~/entities"
import { numForm } from "~/utils/numForm"
import {
    ButtonsGrid,
    Container,
    Modal,
    Heading,
    LinkButton,
    Button,
    useActionState,
    useStateToast
} from "~/ui"
import { Picture } from "~/components/picture"
import { useStore, useSpace } from "~/store"

const statusMap: { [key in ConnectionStatus]: string } = {
    [ConnectionStatus.Disconnected]: "Waiting for connection...",
    [ConnectionStatus.Connected]: "Connecting...",
    [ConnectionStatus.Ready]: "Connected to server",
    [ConnectionStatus.Error]: "Connection error"
}

const AccountAndSpaceView = observer(() => {
    const store = useStore()
    const space = useSpace()
    const [_location, navigate] = useLocation()
    const toast = useStateToast()

    const [leaveState, setLeaveState] = useActionState<void>()
    const leave = () => {
        const state = fromPromise(store.leaveSpace())
        const name = space.space.name
        setLeaveState(state)
        state.then(
            () => {
                toast.success(<>You have left the space "{name}"</>)
                navigate("/")
            },
            (e) => {
                toast.error(<>Couldn't perform an operation: {e.message}</>)
            }
        )
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
                        <Button
                            onClick={leave}
                            isDisabled={leaveState.state === "pending"}
                        >
                            Leave
                        </Button>
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
                    <Picture picture={store.user!.picture} />
                    <div>{store.user!.email}</div>
                </Row>
                <ButtonsGrid>
                    <LinkButton to="/account/settings">
                        Account settings
                    </LinkButton>
                    <Button onClick={() => store.logout()}>Log out</Button>
                </ButtonsGrid>
            </Col>
            <Col gap={16}>
                <Heading>Space</Heading>
                <Row gap={8} align="center">
                    <Picture picture={space.space.picture} />
                    <Col>
                        <div>{space.space.name}</div>
                        <div style={{ opacity: ".6" }}>
                            {numForm(space.space.membersCount, {
                                one: "member",
                                many: "members"
                            })}{" "}
                            &ndash; {spaceRoleMap[role]}
                        </div>
                    </Col>
                </Row>
                <ButtonsGrid>
                    <LinkButton to="/space/members">Members</LinkButton>
                    {canInvite && (
                        <LinkButton to="/space/invite">Invite</LinkButton>
                    )}
                    {role === "owner" ? (
                        <>
                            <LinkButton to="/space/settings">
                                Space settings
                            </LinkButton>
                        </>
                    ) : (
                        <Button onClick={() => leaveModal.open()}>
                            Leave space
                        </Button>
                    )}
                </ButtonsGrid>
            </Col>
            <ButtonsGrid>
                <LinkButton to="/switch-space">Switch space</LinkButton>
                <LinkButton to="/create-space">Create space</LinkButton>
            </ButtonsGrid>
        </Col>
    )

    return (
        <Container title="Account and spaces" onClose={() => navigate("/")}>
            {content}
            {status}
            {leaveModal.render()}
        </Container>
    )
})

export { AccountAndSpaceView }
