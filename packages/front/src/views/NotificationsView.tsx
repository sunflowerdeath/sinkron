import { useMemo } from "react"
import { remove } from "mobx"
import { observer, useLocalObservable } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Col } from "oriente"

import type { Invite } from "~/entities"
import { useStore } from "~/store"
import { Button, useStateToast, useActionState, ActionStateView } from "~/ui"
import ButtonsGrid from "~/ui/ButtonsGrid"
import Container from "~/ui/Container"

type InviteListItemProps = {
    invite: Invite
    onRemoveFromList: () => void
}

const InviteListItem = observer((props: InviteListItemProps) => {
    const { invite, onRemoveFromList } = props

    const [_location, navigate] = useLocation()
    const toast = useStateToast()
    const store = useStore()

    const [actionState, setActionState] = useActionState<Invite>()
    const runAction = (action: "cancel" | "hide" | "accept" | "decline") => {
        const state = store.inviteAction(invite.id, action)
        setActionState(state)
        state.then(
            (invite: Invite) => {
                if (action === "cancel") {
                    toast.success(<>Invite cancelled</>)
                } else if (action === "decline") {
                    toast.success(<>Invite declined</>)
                } else if (action === "accept") {
                    toast.success(
                        <>You have joined the space "{invite.space.name}"</>
                    )
                    store.user.spaces.push({
                        ...invite.space,
                        role: invite.role
                    })
                    store.changeSpace(invite.space.id)
                    navigate("/")
                }
                onRemoveFromList()
            },
            (e) => {
                toast.error(
                    <>
                        Couldn't {action} invite: {e.message}
                    </>
                )
            }
        )
    }

    let content: React.ReactNode
    if (invite.from.id === store.user.id) {
        if (invite.status === "sent") {
            content = (
                <>
                    <div>
                        You invited user {invite.to.email} to join space "
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
                        User {invite.to.email} {text} your invite to join space
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
                    User {invite.from.email} invites you to join space "
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
    const [_location, navigate] = useLocation()
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
