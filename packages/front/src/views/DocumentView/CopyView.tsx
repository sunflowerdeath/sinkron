import { Col, Row } from "oriente"

import { SpaceStore } from "~/store"
import { Picture } from "~/components/picture"
import { useActionState } from "~/ui/ActionStateView"
import { Space } from "~/entities"
import { Button, useStateToast, Heading } from "~/ui"

type CopyDialogProps = {
    docId: string
    spaceStore: SpaceStore
    spaces: Space[]
    toast: ReturnType<typeof useStateToast>
    onClose: () => void
}

const CopyView = (props: CopyDialogProps) => {
    const { docId, spaces, spaceStore, toast, onClose } = props

    const [actionState, setActionState] = useActionState()
    const copy = (toSpaceId: string) => {
        const state = spaceStore.copyDocumentToAnotherSpace({
            docId,
            toSpaceId
        })
        state.then(
            () => {
                toast.success("Document copied!")
                onClose()
            },
            (e) => {
                toast.error(<>Couldn't copy document: {e.message}</>)
            }
        )
        setActionState(state)
    }

    const buttonsList = spaces.map((s) => {
        const isCurrent = s.id === spaceStore.space.id
        const canCopy = s.role !== "readonly"
        return (
            <Button
                key={s.id}
                style={{ justifyContent: "start" }}
                isDisabled={!canCopy || actionState.state === "pending"}
                onClick={() => copy(s.id)}
            >
                <Row gap={8} align="center">
                    <Picture picture={s.picture} />
                    <Col>
                        <div>
                            {s.name}
                            {isCurrent && "(current)"}
                        </div>
                        <div style={{ color: "var(--color-secondary)" }}>
                            {s.role}
                        </div>
                    </Col>
                </Row>
            </Button>
        )
    })
    return (
        <Col gap={20} align="stretch">
            <Heading>Copy to another space</Heading>
            <Col gap={8} align="stretch">
                {buttonsList}
            </Col>
            <Button onClick={onClose}>Cancel</Button>
        </Col>
    )
}

export default CopyView
