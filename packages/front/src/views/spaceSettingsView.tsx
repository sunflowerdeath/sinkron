import { useState } from "react"
import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { IPromiseBasedObservable, fromPromise } from "mobx-utils"
import { ceil } from "lodash-es"

import { useUserStore, useSpaceStore, UserStore, SpaceStore } from "~/store"
import {
    Button,
    ButtonsGrid,
    Container,
    Row,
    Col,
    LinkButton,
    Input,
    Heading,
    useDialog,
    useStateToast
} from "~/ui"
import { Picture } from "~/components/picture"

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
    const userStore = useUserStore()
    const spaceStore = useSpaceStore()
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
        <DeleteSpaceView store={userStore} onClose={close} toast={toast} />
    ))

    const [deleteOrphansState, setDeleteOrphansState] = useState<
        IPromiseBasedObservable<object>
    >(fromPromise.resolve({}))
    const deleteOrphans = () => {
        const state = spaceStore.deleteOrphans()
        state.then(
            () => {
                toast.success("Completed")
            },
            (e: Error) => {
                toast.error(<>Error: {e.message}</>)
            }
        )
        setDeleteOrphansState(state)
    }

    const usedStorageMb = ceil(space.usedStorage / (1024 * 1024), 2)
    const storage = (
        <Col gap={16}>
            <Heading>Storage</Heading>
            <div>Used storage: {usedStorageMb} / 100Mb</div>
            {space.usedStorage > 0 && (
                <ButtonsGrid>
                    <Button
                        onClick={deleteOrphans}
                        isDisabled={deleteOrphansState.state === "pending"}
                    >
                        Delete unused files
                    </Button>
                </ButtonsGrid>
            )}
        </Col>
    )

    return (
        <Container title="Space settings" onClose={() => navigate("/")}>
            <Row gap={8} align="center">
                <Picture picture={space.picture} />
                <div>{space.name}</div>
            </Row>
            <ButtonsGrid>
                <LinkButton to="/space/picture">Change picture</LinkButton>
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

export { SpaceSettingsView }
