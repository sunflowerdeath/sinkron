import { useState } from "react"
import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Col, Row } from "oriente"

import closeSvg from "@material-design-icons/svg/outlined/close.svg"
import expandMoreSvg from "@material-design-icons/svg/outlined/expand_more.svg"

import { useSpace } from "../store"
import Container from "../ui/Container"
import {
    Button,
    Input,
    Menu,
    MenuItem,
    Icon,
    useActionState,
    useStateToast
} from "../ui"

interface SelectOption {
    value: string
    label: React.ReactNode
}

interface SelectProps {
    value: string | undefined
    onChange: (value: string | undefined) => void
    options: SelectOption[]
    placeholder: React.ReactNode
}

const Select = (props: SelectProps) => {
    const { value, onChange, options, placeholder } = props

    const selectedOption =
        value !== undefined ? options.find((o) => o.value === value) : undefined

    const menu = () => {
        return options.length === 0 ? (
            <Row style={{ color: "#999", height: 45 }} align="center">
                No items
            </Row>
        ) : (
            options.map((option) => (
                <MenuItem
                    value={option.value}
                    key={option.value}
                    onSelect={() => onChange(option.value)}
                >
                    {option.label}
                </MenuItem>
            ))
        )
    }

    return (
        <Menu
            menu={menu}
            matchWidth
            autoSelectFirstItem={false}
            maxHeight={240}
            placement={{ padding: 8 }}
        >
            {(ref, { open }) => (
                <Row
                    style={{
                        height: 60,
                        border: "2px solid #999",
                        padding: "0 8px",
                        alignSelf: "normal",
                        boxSizing: "border-box"
                    }}
                    align="center"
                    ref={ref}
                    onClick={open}
                    gap={8}
                >
                    <div style={{ flexGrow: 1 }}>
                        {selectedOption ? (
                            selectedOption.label
                        ) : (
                            <div style={{ color: "#999" }}>{placeholder}</div>
                        )}
                    </div>
                    {value ? (
                        <Button size="s" onClick={() => onChange(undefined)}>
                            <Icon svg={closeSvg} />
                        </Button>
                    ) : (
                        <Icon svg={expandMoreSvg} />
                    )}
                </Row>
            )}
        </Menu>
    )
}

const InviteMemberView = observer(() => {
    const [_location, navigate] = useLocation()
    const toast = useStateToast()
    const space = useSpace()

    const [name, setName] = useState("")
    const [role, setRole] = useState<string | undefined>()

    const [sendInviteState, setSendInviteState] = useActionState()
    const sendInvite = () => {
        const state = space.sendInvite(name, role!)
        setSendInviteState(state)
        state.then(
            () => {
                navigate("/")
                toast.success(<>You have sent an invite to the user "{name}"</>)
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

    const isValid = name.length > 0 && role !== undefined

    return (
        <Container title="Invite member" onClose={() => navigate("/")}>
            <Col gap={8} style={{ alignSelf: "stretch" }} align="normal">
                Username
                <Input autoFocus value={name} onChange={setName} />
            </Col>
            <Col gap={8} style={{ alignSelf: "stretch" }}>
                Role
                <Select
                    value={role}
                    onChange={setRole}
                    options={options}
                    placeholder="Select role"
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
