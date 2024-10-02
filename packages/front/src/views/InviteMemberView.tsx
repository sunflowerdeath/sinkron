import { useState } from "react"
import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Col } from "oriente"

import { useSpace } from "../store"
import Container from "../ui/Container"
import { Button, Input, useActionState, useStateToast, Select } from "../ui"

const InviteMemberView = observer(() => {
    const [_location, navigate] = useLocation()
    const toast = useStateToast()
    const space = useSpace()

    const [email, setEmail] = useState("")
    const [role, setRole] = useState<string | undefined>()

    const [sendInviteState, setSendInviteState] = useActionState()
    const sendInvite = () => {
        const state = space.sendInvite(email, role!)
        setSendInviteState(state)
        state.then(
            () => {
                navigate("/")
                toast.success(
                    <>You have sent an invite to the user "{email}"</>
                )
            },
            (e) => {
                toast.error(<>Couldn't send invite: {e.message}</>)
            }
        )
    }

    const options = [
        { value: "readonly", label: "Read-only" },
        { value: "editor", label: "Editor" }
    ]
    if (space.space.role === "owner") {
        options.push({ value: "admin", label: "Admin" })
    }

    const isValid = email.length > 0 && role !== undefined

    return (
        <Container title="Invite member" onClose={() => navigate("/")}>
            <Col gap={8} style={{ alignSelf: "stretch" }} align="normal">
                Email
                <Input autoFocus value={email} onChange={setEmail} />
            </Col>
            <Col gap={8} style={{ alignSelf: "stretch" }}>
                Role
                <Select
                    value={role}
                    onChange={setRole}
                    options={options}
                    placeholder="Select role"
                    isClearable
                />
            </Col>
            <Button
                isDisabled={!isValid || sendInviteState.state === "pending"}
                onClick={sendInvite}
            >
                Send invite
            </Button>
        </Container>
    )
})

export default InviteMemberView
