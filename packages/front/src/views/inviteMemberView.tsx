import { useMemo } from "react"
import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Col } from "oriente"

import { useSpaceStore } from "~/store"
import {
    Container,
    Button,
    Input,
    useActionState,
    useStateToast,
    Select
} from "~/ui"
import { FormStore, FieldStore } from "~/utils/forms"
import { validateEmail } from "~/utils/validations"
import { Field } from "~/components/field"

const InviteMemberView = observer(() => {
    const [_location, navigate] = useLocation()
    const toast = useStateToast()
    const space = useSpaceStore()

    const form = useMemo(
        () =>
            new FormStore({
                fields: {
                    email: new FieldStore({
                        isRequired: true,
                        requiredErrorMessage: "Email is required",
                        validations: {
                            email: validateEmail
                        },
                        errorMessages: {
                            email: "Invalid email"
                        }
                    }),
                    role: new FieldStore({
                        isRequired: true,
                        requiredErrorMessage: "Role is required",
                        errorMessages: {}
                    })
                }
            }),
        []
    )

    const [sendInviteState, setSendInviteState] = useActionState()
    const sendInvite = () => {
        const { email, role } = form.values
        const state = space.sendInvite(email!, role!)
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

    return (
        <Container title="Invite member" onClose={() => navigate("/")}>
            <Field
                field={form.fields.email}
                showRequiredError="off"
                showValidationErrors="onBlur"
            >
                {({ inputProps, error }) => (
                    <Col
                        gap={8}
                        style={{ alignSelf: "stretch" }}
                        align="normal"
                    >
                        Email
                        <Input autoFocus {...inputProps} />
                        {error && (
                            <div style={{ color: "var(--color-error)" }}>
                                {error}
                            </div>
                        )}
                    </Col>
                )}
            </Field>
            <Field field={form.fields.role} showRequiredError="off">
                {({ inputProps, error }) => (
                    <Col gap={8} style={{ alignSelf: "stretch" }}>
                        Role
                        <Select
                            {...inputProps}
                            options={options}
                            placeholder="Select role"
                            isClearable
                        />
                        {error && (
                            <div style={{ color: "var(--color-error)" }}>
                                {error}
                            </div>
                        )}
                    </Col>
                )}
            </Field>
            <Button
                isDisabled={
                    !form.isValid || sendInviteState.state === "pending"
                }
                onClick={sendInvite}
            >
                Send invite
            </Button>
        </Container>
    )
})

export { InviteMemberView }
