import { useMemo } from "react"
import { observer } from "mobx-react-lite"
import { fromPromise } from "mobx-utils"
import { useLocation } from "wouter"
import { Col, Row } from "oriente"

import expandMoreSvg from "@material-design-icons/svg/outlined/expand_more.svg"

import { useStore } from "../store"
import { fetchJson } from "../fetchJson"

import { Avatar } from "../ui/avatar"
import Container from "../ui/Container"
import { Button } from "../ui/button"
import { Icon } from "../ui/icon"
import { Menu, MenuItem } from "../ui/menu"
import ActionStateView from "../ui/ActionStateView"

/*
roles
    owner - add admins + all other
    admin - invite and remove users
    member - only view

invite
    edit invite
    cancel invite
guest:
    review and change access
    remove
member
    change role
    remove
*/


type SpaceMember = {
    role: string
    name: string
    id: string
}

type SpaceMemberListItemProps = {
    member: SpaceMember
}

const SpaceMemberListItem = observer((props: SpaceMemberListItemProps) => {
    const { member } = props
    return (
        <Row gap={8} style={{ alignSelf: "stretch" }} align="center">
            <Avatar name={member.name} />
            <Col style={{ flexGrow: 1 }}>
                <div>{member.name}</div>
                <div style={{ opacity: ".6" }}>{member.role}</div>
            </Col>
            <Button>Change</Button>
            <Button>Remove</Button>
        </Row>
    )
})

const SpaceMembersView = observer(() => {
    const [location, navigate] = useLocation()
    const store = useStore()

    const fetchMembersState = useMemo(
        () =>
            fromPromise(
                fetchJson({
                    method: "GET",
                    url: `/api/spaces/${store.spaceId}/members`
                })
            ),
        []
    )

    return (
        <Container title="Space members" onClose={() => navigate("/")}>
            <Button>Invite user</Button>
            <ActionStateView state={fetchMembersState}>
                {(result) => (
                    <Col gap={8} style={{ alignSelf: "stretch" }}>
                        {result.value.map((m) => (
                            <SpaceMemberListItem member={m} />
                        ))}
                        <Row
                            gap={8}
                            style={{ alignSelf: "stretch" }}
                            align="center"
                        >
                            <Avatar name="Usernamelonglonglong" />
                            <Col style={{ flexGrow: 1 }}>
                                <div>Sunflowerdeath (You)</div>
                                <div style={{ opacity: ".6" }}>Owner</div>
                            </Col>
                        </Row>
                        <Row
                            gap={8}
                            style={{ alignSelf: "stretch" }}
                            align="center"
                        >
                            <Avatar name="Usernamelonglonglong" />
                            <Col style={{ flexGrow: 1 }}>
                                <div>Usernamelonglonglong</div>
                                <div
                                    style={{ color: "var(--color-secondary)" }}
                                >
                                    Invited to join as admin
                                </div>
                            </Col>
                            <Button>
                                <Icon svg={expandMoreSvg} />
                            </Button>
                        </Row>
                        <Row
                            gap={8}
                            style={{ alignSelf: "stretch" }}
                            align="center"
                        >
                            <Avatar name="Usernamelonglonglong" />
                            <Col style={{ flexGrow: 1 }}>
                                <div>Usernamelonglonglong</div>
                                <div style={{ opacity: ".6" }}>
                                    Guest (Has access to 2 documents)
                                </div>
                            </Col>
                            <Menu
                                menu={() => (
                                    <>
                                        <MenuItem>
                                            Review and change access
                                        </MenuItem>
                                        <MenuItem>Remove from space</MenuItem>
                                    </>
                                )}
                                placement={{ align: "end" }}
                            >
                                {(ref, { open }) => (
                                    <Button ref={ref} onClick={open}>
                                        <Icon svg={expandMoreSvg} />
                                    </Button>
                                )}
                            </Menu>
                        </Row>
                    </Col>
                )}
            </ActionStateView>
        </Container>
    )
})

export default SpaceMembersView
