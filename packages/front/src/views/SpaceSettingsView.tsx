import { useState } from "react"
import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Row, Col } from "oriente"
import { IPromiseBasedObservable, fromPromise } from "mobx-utils"

import { useStore, SpaceStore } from "../store"
import { Button, Avatar, Input, Heading, useDialog, useStateToast } from "../ui"
import ButtonsGrid from "../ui/ButtonsGrid"
import Container from "../ui/Container"

interface RenameSpaceViewProps {
    spaceStore: SpaceStore
    toast: ReturnType<typeof useStateToast>
    onClose: () => void
}

const RenameSpaceView = observer((props: RenameSpaceViewProps) => {
    const { onClose, spaceStore, toast } = props

    const [name, setName] = useState(spaceStore.space.name)
    const isEmpty = name.length === 0

    const [actionState, setActionState] = useState<
        IPromiseBasedObservable<object>
    >(fromPromise.resolve({}))
    const rename = () => {
        const state = spaceStore.renameSpace(name)
        state.then(
            () => {
                toast.success("Space renamed!")
                onClose()
            },
            (e: Error) => {
                toast.error(<>Couldn't rename space: {e.message}</>)
            }
        )
        setActionState(state)
    }

    return (
        <Col gap={20}>
            <Heading>Rename space</Heading>
            <Input value={name} onChange={setName} stretch={true} />
            <ButtonsGrid>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    isDisabled={isEmpty || actionState.state === "pending"}
                    onClick={rename}
                >
                    Rename
                </Button>
            </ButtonsGrid>
        </Col>
    )
})

const SpaceSettingsView = observer(() => {
    const [_location, navigate] = useLocation()
    const store = useStore()
    const spaceStore = store.space!
    const space = spaceStore.space

    const toast = useStateToast()

    const renameDialog = useDialog((close) => (
        <RenameSpaceView
            toast={toast}
            spaceStore={spaceStore}
            onClose={close}
        />
    ))

    const deleteDialog = useDialog((close) => {
        return (
            <Col gap={20}>
                <Heading>Delete space</Heading>
                Are you sure you want to delete space "{space.name}"?
                <ButtonsGrid>
                    <Button onClick={close}>Cancel</Button>
                    <Button>Delete</Button>
                </ButtonsGrid>
            </Col>
        )
    })

    return (
        <Container title="Space settings" onClose={() => navigate("/")}>
            <Row gap={8} align="center">
                <Avatar name={space.name} />
                <div>{space.name}</div>
            </Row>
            <ButtonsGrid>
                <Button>Change image</Button>
                <Button onClick={() => renameDialog.open()}>Change name</Button>
                <Button onClick={() => deleteDialog.open()}>
                    Delete space
                </Button>
            </ButtonsGrid>
            {renameDialog.render()}
            {deleteDialog.render()}
        </Container>
    )
})

export default SpaceSettingsView
