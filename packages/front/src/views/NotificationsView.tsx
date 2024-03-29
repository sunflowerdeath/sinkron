import { useMemo, useState } from "react"
import { remove } from "mobx"
import { observer, useLocalObservable } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Col } from "oriente"

import type { Invite } from "../entities"

import { Button } from "../ui/button"
import ButtonsGrid from "../ui/ButtonsGrid"
import { useStore } from "../store"
import ActionStateView, { initialActionState } from "../ui/ActionStateView"
import Container from "../ui/Container"
import { useToast, Toast } from "../ui/toast"

type InviteListItemProps = {
    invite: Invite
    onRemoveFromList: () => void
}

const InviteListItem = observer((props: InviteListItemProps) => {
    const { invite, onRemoveFromList } = props

    const [location, navigate] = useLocation()

    const toast = useToast()
    const store = useStore()

    const [actionState, setActionState] = useState(initialActionState)
    const runAction = (action: "cancel" | "hide" | "accept" | "decline") => {
        const state = store.inviteAction(invite.id, action)
        setActionState(state)
        state
            .then((invite: Invite) => {
                if (action === "cancel") {
                    toast.show({ children: <Toast>Invite cancelled</Toast> })
                } else if (action === "decline") {
                    toast.show({ children: <Toast>Invite declined</Toast> })
                } else if (action === "accept") {
                    toast.show({
                        children: (
                            <Toast>
                                You have joined the space "{invite.space.name}"
                            </Toast>
                        )
                    })
                    store.user.spaces.push({
                        ...invite.space,
                        role: invite.role
                    })
                    store.changeSpace(invite.space.id)
                    navigate("/")
                }
                onRemoveFromList()
            })
            .catch((e) => {
                toast.show({
                    children: (
                        <Toast variant="error">
                            Couldn't {action} invite: {e.message}
                        </Toast>
                    )
                })
            })
    }

    let content: React.ReactNode
    if (invite.from.id === store.user.id) {
        if (invite.status === "sent") {
            content = (
                <>
                    <div>
                        You invited user @{invite.to.name} to join space "
                        {invite.space.name}" with a role {invite.role}.
                    </div>
                    <Button
                        onClick={() => runAction("cancel")}
                        isDisabled={actionState.state === "pending"}
                    >
                        Cancel invite
                    </Button>
                </>
            )
        } else {
            const text = invite.status === "accepted" ? "accepted" : "declined"
            content = (
                <>
                    <div>
                        User @{invite.to.name} {text} your invite to join space
                        "{invite.space.name}" with a role {invite.role}.
                    </div>
                    <Button onClick={() => runAction("hide")}>Hide</Button>
                </>
            )
        }
    } else {
        // invite.to === store.user.id
        content = (
            <>
                <div>
                    User @{invite.from.name} invites you to join space "
                    {invite.space.name}" with a role {invite.role}.
                </div>
                <ButtonsGrid>
                    <Button onClick={() => runAction("decline")}>
                        Decline
                    </Button>
                    <Button onClick={() => runAction("accept")}>Accept</Button>
                </ButtonsGrid>
            </>
        )
    }

    return (
        <Col gap={8} align="normal">
            {content}
        </Col>
    )
})

type InviteListProps = {
    invites: Invite[]
}

const InviteList = observer((props: InviteListProps) => {
    const invites = useLocalObservable(() => props.invites)

    if (invites.length == 0) {
        return (
            <Col
                align="center"
                style={{ paddingTop: 16, color: "var(--color-secondary)" }}
            >
                No notifications
            </Col>
        )
    }

    return (
        <Col gap={32}>
            {invites.map((invite, idx) => (
                <InviteListItem
                    key={invite.id}
                    invite={invite}
                    onRemoveFromList={() => remove(invites, String(idx))}
                />
            ))}
        </Col>
    )
})

const NotificationsView = observer(() => {
    const [location, navigate] = useLocation()
    const store = useStore()

    const fetchState = useMemo(() => store.fetchNotifications(), [])

    const content = (
        <ActionStateView state={fetchState}>
            {(notifications) => <InviteList invites={notifications.invites} />}
        </ActionStateView>
    )

    return (
        <Container title="Notifications" onClose={() => navigate("/")}>
            {content}
        </Container>
    )
})

export default NotificationsView
