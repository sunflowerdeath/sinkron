import { observer } from 'mobx-react-lite'
import { Observer } from 'mobx-react-lite'
import { Link } from 'wouter'

import { Col, Row, useModal } from 'oriente'
import { Modal } from '../ui/modal'
import { Heading } from '../ui/heading'
import ButtonsGrid from '../ui/ButtonsGrid'
import { Avatar } from '../ui/avatar'
import { Button } from '../ui/button'
import { useStore } from '../store'

const AccountAndSpaceView = observer(() => {
    const store = useStore()

    const leaveModal = useModal({
        Component: Modal,
        width: 440,
        isCentered: true,
        children: (close) => {
            return (
                <Col gap={20}>
                    Are you sure you want to leave space "name"?
                    <ButtonsGrid>
                        <Button onClick={close}>Cancel</Button>
                        <Button>Leave</Button>
                    </ButtonsGrid>
                </Col>
            )
        }
    })

    const deleteModal = useModal({
        Component: Modal,
        width: 440,
        isCentered: true,
        children: (close) => {
            return (
                <Col gap={20}>
                    Are you sure you want to delete space "name"?
                    <ButtonsGrid>
                        <Button onClick={close}>Cancel</Button>
                        <Button>DELETE</Button>
                    </ButtonsGrid>
                </Col>
            )
        }
    })

    const isOwner = store.user!.id === store.space!.owner.id

    const roleText = isOwner ? 'Owner' : store.space!.role

    return (
        <Col gap={20} style={{ padding: "18px 40px" }}>
            <Heading>Account and spaces</Heading>
            <Col gap={16}>
                <Heading>Account</Heading>
                <Row gap={8} align="center">
                    <Avatar name={store.user!.name} />
                    <div>{store.user!.name}</div>
                </Row>
                <ButtonsGrid>
                    <Button>Account settings</Button>
                    <Button onClick={() => store.logout()}>Logout</Button>
                </ButtonsGrid>
            </Col>
            <Col gap={16}>
                <Heading>Space</Heading>
                <Row gap={8}>
                    <Avatar name={store.space!.name} />
                    <Col>
                        <div>{store.space!.name}</div>
                        <div style={{ opacity: '.6' }}>
                            {store.space!.membersCount} member &ndash;{' '}
                            {roleText}
                        </div>
                    </Col>
                </Row>
                <ButtonsGrid>
                    <Button>Invite member</Button>
                    <Button as={Link} to="/space/members">
                        Members list
                    </Button>
                    <Button>Space settings</Button>
                    {isOwner ? (
                        <Button onClick={() => deleteModal.open()}>
                            Delete space
                        </Button>
                    ) : (
                        <Button onClick={() => leaveModal.open()}>
                            Leave space
                        </Button>
                    )}
                </ButtonsGrid>
            </Col>
            <ButtonsGrid>
                <Button as={Link} to="/switch-space">
                    Switch space
                </Button>
                <Button as={Link} to="/create-space">
                    Create new space
                </Button>
            </ButtonsGrid>
            {leaveModal.render()}
            {deleteModal.render()}
        </Col>
    )
})

export default AccountAndSpaceView
