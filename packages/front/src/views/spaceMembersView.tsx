import { useMemo, useState } from "react"
import { observer } from "mobx-react-lite"
import { makeAutoObservable } from "mobx"
import { useLocation } from "wouter"
import { partition } from "lodash-es"
import {} from "oriente"

import expandMoreSvg from "@material-design-icons/svg/outlined/expand_more.svg"

import { useUserStore, useSpaceStore, SpaceStore } from "~/store"
import { FetchMembersResponse } from "~/store/spaceStore"
import { SpaceRole, spaceRoleMap, SpaceMember, Invite } from "~/entities"
import {
    Col,
    Row,
    Button,
    ButtonsGrid,
    Container,
    LinkButton,
    Icon,
    Menu,
    MenuItem,
    ActionStateView,
    initialActionState,
    ActionState,
    useActionState,
    useStateToast,
    useDialog,
    Heading,
    Select
} from "~/ui"
import { Picture } from "~/components/picture"

type SpaceMembersStoreProps = {
    spaceStore: SpaceStore
    toast: ReturnType<typeof useStateToast>
}

class SpaceMembersStore {
    spaceStore: SpaceStore
    members: SpaceMember[] = []
    invites: Invite[] = []
    fetchState: ActionState<FetchMembersResponse> = initialActionState
    toast: ReturnType<typeof useStateToast>

    constructor(props: SpaceMembersStoreProps) {
        const { spaceStore, toast } = props
        this.spaceStore = spaceStore
        this.toast = toast

        makeAutoObservable(this)

        this.fetchState = spaceStore.fetchMembers()
        this.fetchState.then(({ members, invites }) => {
            this.members = members
            this.invites = invites
        })
    }

    cancelInvite(invite: Invite) {
        const state = this.spaceStore.cancelInvite(invite.id)
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

    removeMember(member: SpaceMember) {
        const { id, email } = member
        const state = this.spaceStore.removeMember(member.id)
        state.then(
            () => {
                const idx = this.members.findIndex((m) => m.id === id)
                this.members.splice(idx, 1)
                this.toast.success(
                    <>Member "{email}" has been removed from the space</>
                )
            },
            (error) => {
                this.toast.error(<>Couldn't remove member: {error.message}</>)
            }
        )
        return state
    }

    updateMember(userId: string, role: SpaceRole) {
        const state = this.spaceStore.updateMember(userId, role)
        state.then(
            () => {
                const member = this.members.find((m) => m.id === userId)
                if (member !== undefined) member.role = role
            },
            (error) => {
                this.toast.error(<>Couldn't update member: {error.message}</>)
            }
        )
        return state
    }
}

interface UpdateRoleDialogProps {
    membersStore: SpaceMembersStore
    member: SpaceMember
    onClose: () => void
}

const UpdateRoleDialog = observer((props: UpdateRoleDialogProps) => {
    const { membersStore, member, onClose } = props

    const [role, setRole] = useState<string | undefined>(member.role)

    const [updateState, setUpdateState] = useActionState()
    const update = () => {
        const state = membersStore.updateMember(member.id, role as SpaceRole)
        setUpdateState(state)
        state.then(onClose)
    }

    const roles: SpaceRole[] =
        membersStore.spaceStore.space.role === "owner"
            ? ["readonly", "editor", "admin"]
            : ["readonly", "editor"]
    const options = roles.map((r) => ({ value: r, label: spaceRoleMap[r] }))

    return (
        <Col gap={16}>
            <Heading>Change member role</Heading>
            <Row gap={8} style={{ alignSelf: "stretch" }} align="center">
                <Picture picture={member.picture} />
                <Col style={{ flexGrow: 1 }}>
                    <div>{member.email}</div>
                    <div style={{ color: "var(--color-secondary)" }}>
                        {spaceRoleMap[member.role]}
                    </div>
                </Col>
            </Row>
            <Col gap={8} style={{ alignSelf: "stretch" }}>
                Role
                <Select
                    value={role}
                    onChange={setRole}
                    options={options}
                    placeholder="Select role"
                />
            </Col>
            <ButtonsGrid>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={update}
                    isDisabled={updateState.state === "pending"}
                >
                    Change role
                </Button>
            </ButtonsGrid>
        </Col>
    )
})

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
                <MenuItem onSelect={() => updateDialog.open()}>
                    Change role
                </MenuItem>
                <MenuItem onSelect={remove}>Remove from space</MenuItem>
            </>
        )
    }

    const updateDialog = useDialog((close) => (
        <UpdateRoleDialog
            membersStore={store}
            member={member}
            onClose={close}
        />
    ))

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
            <Picture picture={member.picture} />
            <Col style={{ flexGrow: 1 }}>
                <div>{member.email}</div>
                <div style={{ color: "var(--color-secondary)" }}>
                    {spaceRoleMap[member.role]}
                    {isCurrentUser && " (You)"}
                </div>
            </Col>
            {actionsButton}
            {updateDialog.render()}
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

    const [_cancelState, setCancelState] = useActionState()
    const cancel = () => {
        setCancelState(store.cancelInvite(invite))
    }

    const menu = () => {
        return (
            <>
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
            <Picture picture={{ emoji: "dotted_line_face", color: "grey" }} />
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

    const userStore = useUserStore()
    const spaceStore = useSpaceStore()
    const role = spaceStore.space.role

    const [owner, restMembers] = partition(members, (m) => m.role === "owner")

    return (
        <Col gap={8} style={{ alignSelf: "stretch" }}>
            {owner.map((m) => (
                <SpaceMemberListItem
                    key={m.id}
                    member={m}
                    currentUserRole={role}
                    currentUserId={userStore.user.id}
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
                    currentUserId={userStore.user.id}
                    store={membersStore}
                />
            ))}
        </Col>
    )
})

const SpaceMembersView = observer(() => {
    const spaceStore = useSpaceStore()
    const [_location, navigate] = useLocation()

    const toast = useStateToast()
    const membersStore = useMemo(
        () => new SpaceMembersStore({ spaceStore, toast }),
        []
    )

    const role = spaceStore.space.role
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

export { SpaceMembersView }
