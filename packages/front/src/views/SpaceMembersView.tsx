import { useMemo } from "react"
import { observer } from "mobx-react-lite"
import { useLocation, Link } from "wouter"
import { Col, Row } from "oriente"

import expandMoreSvg from "@material-design-icons/svg/outlined/expand_more.svg"

import { useStore, useSpace, SpaceRole } from "../store"

import { Avatar } from "../ui/avatar"
import Container from "../ui/Container"
import { Button } from "../ui/button"
import { Icon } from "../ui/icon"
import { Menu, MenuItem } from "../ui/menu"
import ActionStateView from "../ui/ActionStateView"

type SpaceMember = {
    role: string
    name: string
    id: string
}

type SpaceMemberListItemProps = {
    member: SpaceMember
    currentUserId: string
    currentUserRole: SpaceRole
}

const SpaceMemberListItem = observer((props: SpaceMemberListItemProps) => {
    const { member, currentUserRole, currentUserId } = props

    const menu = () => {
        return (
            <>
                <MenuItem>Change role</MenuItem>
                <MenuItem>Remove from space</MenuItem>
            </>
        )
    }

    const isCurrentUser = member.id === currentUserId

    const showActions =
        !isCurrentUser &&
        (member.role === "admin"
            ? currentUserRole === "owner"
            : ["owner", "admin"].includes(currentUserRole))

    const actionsButton = showActions && (
        <Menu menu={menu} placement={{ align: "end", offset: 8 }}>
            {(ref, { open }) => (
                <Button ref={ref} onClick={open}>
                    <Icon svg={expandMoreSvg} />
                </Button>
            )}
        </Menu>
    )

    return (
        <Row gap={8} style={{ alignSelf: "stretch" }} align="center">
            <Avatar name={member.name} />
            <Col style={{ flexGrow: 1 }}>
                <div>{member.name}</div>
                <div style={{ opacity: ".6" }}>
                    {member.role}
                    {isCurrentUser && " (You)"}
                </div>
            </Col>
            {actionsButton}
        </Row>
    )
})

const SpaceMembersView = observer(() => {
    const store = useStore()
    const space = useSpace()
    const [location, navigate] = useLocation()

    const fetchMembersState = useMemo(() => space.fetchMembers(), [])

    const role = space.space.role
    const canInvite = ["admin", "owner"].includes(role)

    return (
        <Container title="Space members" onClose={() => navigate("/")}>
            {canInvite && (
                <Button as={Link} to="/space/invite">
                    Invite
                </Button>
            )}
            <ActionStateView state={fetchMembersState}>
                {(result) => (
                    <Col gap={8} style={{ alignSelf: "stretch" }}>
                        {result.value.map((m) => (
                            <SpaceMemberListItem
                                member={m}
                                currentUserRole={role}
                                currentUserId={store.user.id}
                            />
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
                                placement={{ align: "end", offset: 8 }}
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
