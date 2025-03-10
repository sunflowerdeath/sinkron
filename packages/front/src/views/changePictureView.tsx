import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Row } from "oriente"
import { useState } from "react"

import { useUserStore, useSpaceStore } from "~/store"
import {
    ButtonsGrid,
    Container,
    Heading,
    Button,
    useStateToast,
    ActionState,
    useActionState
} from "~/ui"
import { emojis } from "~/emojis"
import { Picture, colors } from "~/components/picture"
import { Picture as PictureEntity } from "~/entities"

type ChangePictureViewProps = {
    title: React.ReactNode
    initialValue: PictureEntity
    onClose: () => void
    onSave: (picture: PictureEntity) => ActionState<any>
}

const ChangePictureView = observer((props: ChangePictureViewProps) => {
    const { title, initialValue, onClose, onSave } = props

    const [emoji, setEmoji] = useState<keyof typeof emojis>(
        initialValue.emoji as keyof typeof emojis
    )
    const [color, setColor] = useState<keyof typeof colors>(
        initialValue.color as keyof typeof colors
    )

    const toast = useStateToast()

    const [actionState, setActionState] = useActionState<void>()
    const save = () => {
        const picture = { emoji, color }
        const state = onSave(picture)
        setActionState(state)
        state.then(
            () => {
                onClose()
                toast.success(<>Picture changed!</>)
            },
            (e) => {
                toast.error(<>Couldn't change picture: {e.message}</>)
            }
        )
    }

    const colorElems = Object.entries(colors).map(([key, color]) => (
        <div
            key={key}
            style={{ width: 45, height: 45, background: color }}
            onClick={() => setColor(key as keyof typeof colors)}
        />
    ))

    const pictureElems = Object.entries(emojis).map(([key, url]) => (
        <Button
            key={key}
            size="s"
            style={{ width: 45, alignItems: "center" }}
            onClick={() => setEmoji(key as keyof typeof emojis)}
        >
            <img
                src={url}
                style={{ height: "72%", imageRendering: "pixelated" }}
            />
        </Button>
    ))

    return (
        <Container
            title={title}
            onClose={onClose}
            style={{ height: "100dvh", overflow: "hidden" }}
            styles={{ content: { paddingBottom: 8 } }}
        >
            <Picture
                picture={{ color, emoji }}
                size="l"
                style={{ alignSelf: "center" }}
            />
            <Heading>Color</Heading>
            <Row gap={8} wrap={true}>
                {colorElems}
            </Row>
            <Heading>Picture</Heading>
            <Row
                gap={8}
                wrap={true}
                className="scrollbar"
                style={{ overflowY: "scroll", flexGrow: 1, flexBasis: 0 }}
            >
                {pictureElems}
            </Row>
            <ButtonsGrid>
                <Button
                    isDisabled={actionState.state === "pending"}
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <Button
                    isDisabled={actionState.state === "pending"}
                    onClick={save}
                >
                    Save
                </Button>
            </ButtonsGrid>
        </Container>
    )
})

const ChangeUserPictureView = () => {
    const [_location, navigate] = useLocation()
    const userStore = useUserStore()
    return (
        <ChangePictureView
            initialValue={userStore.user.picture}
            title="Change user picture"
            onClose={() => navigate("/")}
            onSave={(picture) => userStore.changePicture(picture)}
        />
    )
}

const ChangeSpacePictureView = () => {
    const [_location, navigate] = useLocation()
    const spaceStore = useSpaceStore()
    return (
        <ChangePictureView
            title="Change space picture"
            initialValue={spaceStore.space.picture}
            onClose={() => navigate("/")}
            onSave={(picture) => spaceStore.changePicture(picture)}
        />
    )
}

export { ChangeSpacePictureView, ChangeUserPictureView }
