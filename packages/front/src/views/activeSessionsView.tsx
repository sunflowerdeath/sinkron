import { useMemo, useState } from "react"
import { observer } from "mobx-react-lite"
import { Col } from "oriente"
import { useLocation } from "wouter"
import { format, parseISO } from "date-fns"

import { useStore } from "~/store"
import { Button, Container, ActionStateView, useActionState } from "~/ui"

interface Session {
    isCurrent: boolean
    lastActive: string
    client: string
    from: string
}

interface SessionListItemProps {
    session: Session
    isLast: boolean
}

const SessionListItem = observer((props: SessionListItemProps) => {
    const { session, isLast } = props
    return (
        <Col
            style={{
                borderBottom: isLast ? "none" : "2px solid #777",
                padding: "8px 0"
            }}
        >
            <div>
                {session.isCurrent
                    ? "Online (This device)"
                    : format(parseISO(session.lastActive), "d MMM h:mm a")}
            </div>
            <div>{session.client || "Unknown client"}</div>
            <div>{session.from || "Unknown location"}</div>
        </Col>
    )
})

const ActiveSessionsView = observer(() => {
    const [_location, navigate] = useLocation()
    const store = useStore()

    const [sessions, setSessions] = useState<Session[]>([])
    const fetchState = useMemo(() => {
        const state = store.fetchActiveSessions()
        state.then(
            (value) => setSessions(value as Session[]),
            () => {}
        )
        return state
    }, [])

    const [terminateState, setTerminateState] = useActionState()
    const terminate = () => {
        const state = store.terminateSessions()
        state.then(
            (value) => setSessions(value as Session[]),
            () => {}
        )
        setTerminateState(state)
    }

    return (
        <Container title="Active sessions" onClose={() => navigate("/")}>
            <ActionStateView state={fetchState}>
                {() => (
                    <Col gap={16} align="normal">
                        <Button
                            onClick={terminate}
                            isDisabled={
                                sessions.length === 1 ||
                                terminateState.state === "pending"
                            }
                        >
                            End sessions from other devices
                        </Button>
                        <Col gap={8} align="normal">
                            {sessions.map((s, idx) => (
                                <SessionListItem
                                    key={idx}
                                    session={s}
                                    isLast={idx === sessions.length - 1}
                                />
                            ))}
                        </Col>
                    </Col>
                )}
            </ActionStateView>
        </Container>
    )
})

export { ActiveSessionsView }
