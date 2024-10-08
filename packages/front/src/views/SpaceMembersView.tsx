import { useMemo } from "react"
import { observer } from "mobx-react-lite"
import { makeAutoObservable } from "mobx"
import { useLocation } from "wouter"
import { partition } from "lodash-es"
import { Col, Row } from "oriente"

import expandMoreSvg from "@material-design-icons/svg/outlined/expand_more.svg"

import { useStore, useSpace, SpaceStore } from "../store"
import { SpaceRole, SpaceMember, Invite } from "../entities"
import {
    Avatar,
    Button,
    LinkButton,
    Icon,
    Menu,
    MenuItem,
    ActionStateView,
    initialActionState,
    useActionState,
    useStateToast
} from "../ui"
import Container from "../ui/Container"

type SpaceMembersStoreProps = {
    space: SpaceStore
    toast: ReturnType<typeof useStateToast>
}

class SpaceMembersStore {
    space: SpaceStore
    members: SpaceMember[] = []
    invites: Invite[] = []
    fetchState = initialActionState
    toast: ReturnType<typeof useStateToast>

    constructor(props: SpaceMembersStoreProps) {
        const { space, toast } = props
        this.space = space
        this.toast = toast

        makeAutoObservable(this)

        this.fetchState = space.fetchMembers()
        this.fetchState.then(({ members, invites }) => {
            this.members = members
            this.invites = invites
        })
    }

    removeMember(member: SpaceMember) {
        const { id, email } = member
        const state = this.space.removeMember(member.id)
        state.then(
            () => {
                const idx = this.members.findIndex((m) => m.id === id)
                this.members.splice(idx, 1)
                this.toast.success(<>Member {email} is removed from space</>)
            },
            (error) => {
                this.toast.error(<>Can't remove member: {error.message}</>)
            }
        )
        return state
    }

    cancelInvite(invite: Invite) {
        const state = this.space.cancelInvite(invite.id)
        state.then(
            () => {
                const idx = this.invites.findIndex((i) => i.id === invite.id)
                this.invites.splice(idx, 1)
                this.toast.success(
                    <>Invite for user {invite.to.email} has beed cancelled</>
                )
            },
            (error) => {
                this.toast.error(
                    <>Couldn't cancel the invite: {error.message}</>
                )
            }
        )
        return state
    }
}

type SpaceMemberListItemProps = {
    member: SpaceMember
    currentUserId: string
    currentUserRole: SpaceRole
    store: SpaceMembersStore
}

const SpaceMemberListItem = observer((props: SpaceMemberListItemProps) => {
    const { member, currentUserRole, currentUserId, store } = props

    const [removeState, setRemoveState] = useActionState()
    const remove = () => {
        setRemoveState(store.removeMember(member))
    }

    const menu = () => {
        return (
            <>
                <MenuItem>Change role</MenuItem>
                <MenuItem onSelect={remove}>Remove from space</MenuItem>
            </>
        )
    }

    const isCurrentUser = member.id === currentUserId

    const showActions =
        !isCurrentUser &&
        member.role !== "owner" &&
        (member.role === "admin"
            ? currentUserRole === "owner"
            : ["owner", "admin"].includes(currentUserRole))

    const actionsButton = showActions && (
        <Menu menu={menu} placement={{ align: "end", offset: 8 }}>
            {(ref, { open }) => (
                <Button
                    ref={ref}
                    onClick={open}
                    isDisabled={removeState.state === "pending"}
                >
                    <Icon svg={expandMoreSvg} />
                </Button>
            )}
        </Menu>
    )

    return (
        <Row gap={8} style={{ alignSelf: "stretch" }} align="center">
            <Avatar name={member.email} />
            <Col style={{ flexGrow: 1 }}>
                <div>{member.email}</div>
                <div style={{ opacity: ".6" }}>
                    {member.role}
                    {isCurrentUser && " (You)"}
                </div>
            </Col>
            {actionsButton}
        </Row>
    )
})

type SpaceInviteItemProps = {
    invite: Invite
    currentUserRole: SpaceRole
    store: SpaceMembersStore
}

const SpaceInviteListItem = observer((props: SpaceInviteItemProps) => {
    const { invite, store, currentUserRole } = props

    const showActions = ["owner", "admin"].includes(currentUserRole)

    const [cancelState, setCancelState] = useActionState()
    const cancel = () => {
        setCancelState(store.cancelInvite(invite))
    }

    const menu = () => {
        return (
            <>
                <MenuItem>Change role</MenuItem>
                <MenuItem onSelect={cancel}>Cancel invite</MenuItem>
            </>
        )
    }

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
            <Avatar name={invite.to.email} />
            <Col style={{ flexGrow: 1 }}>
                <div>{invite.to.email}</div>
                <div style={{ opacity: ".6" }}>
                    Invited to join with role {invite.role}
                </div>
            </Col>
            {actionsButton}
        </Row>
    )
})

interface SpaceMemberListProps {
    store: SpaceMembersStore
}

const SpaceMemberList = observer((props: SpaceMemberListProps) => {
    const membersStore = props.store
    const { members, invites } = membersStore

    const store = useStore()
    const space = useSpace()
    const role = space.space.role

    const [owner, restMembers] = partition(members, (m) => m.role === "owner")

    return (
        <Col gap={8} style={{ alignSelf: "stretch" }}>
            {owner.map((m) => (
                <SpaceMemberListItem
                    key={m.id}
                    member={m}
                    currentUserRole={role}
                    currentUserId={store.user.id}
                    store={membersStore}
                />
            ))}
            {invites.map((i) => (
                <SpaceInviteListItem
                    key={i.id}
                    invite={i}
                    currentUserRole={role}
                    store={membersStore}
                />
            ))}
            {restMembers.map((m) => (
                <SpaceMemberListItem
                    key={m.id}
                    member={m}
                    currentUserRole={role}
                    currentUserId={store.user.id}
                    store={membersStore}
                />
            ))}
            {/*<Row gap={8} style={{ alignSelf: "stretch" }} align="center">
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
                            <MenuItem>Review and change access</MenuItem>
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
            */}
        </Col>
    )
})

const SpaceMembersView = observer(() => {
    const space = useSpace()
    const [_location, navigate] = useLocation()

    const toast = useStateToast()
    const membersStore = useMemo(
        () => new SpaceMembersStore({ space, toast }),
        []
    )

    const role = space.space.role
    const canInvite = ["admin", "owner"].includes(role)

    return (
        <Container title="Space members" onClose={() => navigate("/")}>
            {canInvite && <LinkButton to="/space/invite">Invite</LinkButton>}
            <ActionStateView state={membersStore.fetchState}>
                {() => <SpaceMemberList store={membersStore} />}
            </ActionStateView>
        </Container>
    )
})

export default SpaceMembersView
