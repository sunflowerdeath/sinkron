import { useState } from "react"

import { Col, Row } from "oriente"

import { Avatar, Button, Heading, Input, Select } from "../ui"
import Container from "../ui/Container"

type ShareAndAccessViewProps = {
    onClose: () => void
}

type ShareAccess = "readonly" | "edit"

const accessOptions = [
    { value: "readonly", label: "Read only" },
    { value: "edit", label: "Can edit" }
]

type AccessListItem = {
    email: string
}

const AccessListItem = (props: AccessListItem) => {
    const { email } = props
    return (
        <Row gap={8} align="center" style={{ alignSelf: "stretch" }}>
            <Avatar name={email} />
            <div
                style={{
                    flexGrow: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                }}
            >
                {email}
            </div>
            <Select
                onChange={() => {
                    /* todo */
                }}
                value={"readonly"}
                options={accessOptions}
                style={{ minWidth: 135 }}
            />
        </Row>
    )
}

const ShareAndAccessView = (props: ShareAndAccessViewProps) => {
    const { onClose } = props

    const [role, setRole] = useState<ShareAccess>("readonly")
    return (
        <Container title="Share & Access" onClose={onClose}>
            <Col gap={8}>
                <div>Email of the person to share:</div>
                <Row gap={8} style={{ alignSelf: "stretch" }}>
                    <Input style={{ flexGrow: 1 }} autoFocus value="" />
                    <Select
                        value={role}
                        onChange={(v) => setRole(v as ShareAccess)}
                        options={accessOptions}
                        style={{ minWidth: 135 }}
                    />
                </Row>
                <Button style={{ alignSelf: "stretch" }}>Share</Button>
            </Col>
            <Col gap={16}>
                <Heading>People with access</Heading>
                <Col gap={8} style={{ maxWidth: "100%" }}>
                    <AccessListItem email="test@email.com" />
                    <AccessListItem email="verylongemail@verylongvery.com" />
                    <AccessListItem email="yanasemout@gmail.com" />
                    <AccessListItem email="sunflowerdeath@gmail.com" />
                    <AccessListItem email="sunflowerdeath@protonmail.com" />
                </Col>
            </Col>
        </Container>
    )
}

export default ShareAndAccessView
