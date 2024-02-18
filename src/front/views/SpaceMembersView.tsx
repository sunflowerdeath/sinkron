import { useMemo } from "react"
import { observer } from 'mobx-react-lite'
import { fromPromise } from 'mobx-utils'
import { Col, Row } from 'oriente'

import { useStore } from '../store'
import { fetchJson } from '../fetchJson'

import { Avatar } from '../ui/avatar'
import Container from '../ui/Container'
import { Button } from '../ui/button'
import ActionStateView from '../ui/ActionStateView'

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
        <Row gap={8} style={{ alignSelf: 'stretch' }} align="center">
            <Avatar name={member.name} />
            <Col style={{ flexGrow: 1 }}>
                <div>@{member.name}</div>
                <div style={{ opacity: '.6' }}>{member.role}</div>
            </Col>
            <Button>Change</Button>
            <Button>Remove</Button>
        </Row>
    )
})

const SpaceMembersView = observer(() => {
    const store = useStore()

    const fetchMembersState = useMemo(
        () =>
            fromPromise(
                fetchJson({
                    url: `/api/spaces/${store.space}/members`,
                    method: 'GET'
                })
            ),
        []
    )

    return (
        <Container title="Space members">
            <Button>Invite member</Button>
            <ActionStateView state={fetchMembersState}>
                {(result) => (
                    <Col gap={8} style={{ alignSelf: 'stretch' }}>
                        {result.value.map((m) => (
                            <SpaceMemberListItem member={m} />
                        ))}
                    </Col>
                )}
            </ActionStateView>
        </Container>
    )
})

export default SpaceMembersView
