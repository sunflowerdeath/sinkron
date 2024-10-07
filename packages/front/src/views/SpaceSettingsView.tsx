import { useState } from "react"
import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Row, Col } from "oriente"
import { IPromiseBasedObservable, fromPromise } from "mobx-utils"
import { ceil } from "lodash-es"

import { useStore, UserStore, SpaceStore } from "../store"
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

type DeleteSpaceViewProps = {
    store: UserStore
    onClose: () => void
    toast: ReturnType<typeof useStateToast>
}

const DeleteSpaceView = (props: DeleteSpaceViewProps) => {
    const { store, onClose, toast } = props

    const spaceStore = store.space!

    const [deleteState, setDeleteState] = useState<
        IPromiseBasedObservable<void>
    >(fromPromise.resolve())
    const deleteSpace = async () => {
        const state = fromPromise(store.deleteSpace())
        setDeleteState(state)
        state.then(
            () => {
                toast.success("Space deleted!")
                // navigate("/")
            },
            (e: Error) => {
                toast.error(<>Couldn't delete space: {e.message}</>)
            }
        )
    }

    return (
        <Col gap={20}>
            <Heading>Delete space</Heading>
            Are you sure you want to delete space "{spaceStore.space.name}"?
            <ButtonsGrid>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={deleteSpace}
                    isDisabled={deleteState.state === "pending"}
                >
                    Delete
                </Button>
            </ButtonsGrid>
        </Col>
    )
}

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

    const deleteDialog = useDialog((close) => (
        <DeleteSpaceView store={store} onClose={close} toast={toast} />
    ))

    const usedStorageMb = ceil(space.usedStorage / (1024 * 1024), 2)
    const storage = (
        <Col gap={16}>
            <Heading>Storage</Heading>
            <div>Used storage: {usedStorageMb} / 100Mb</div>
            <Button isDisabled>Delete unused files</Button>
        </Col>
    )

    return (
        <Container title="Space settings" onClose={() => navigate("/")}>
            <Row gap={8} align="center">
                <Avatar name={space.name} />
                <div>{space.name}</div>
            </Row>
            <ButtonsGrid>
                <Button>Change image</Button>
                <Button onClick={() => renameDialog.open()}>
                    Rename space
                </Button>
                <Button onClick={() => deleteDialog.open()}>
                    Delete space
                </Button>
            </ButtonsGrid>
            {storage}
            {renameDialog.render()}
            {deleteDialog.render()}
        </Container>
    )
})

export default SpaceSettingsView
