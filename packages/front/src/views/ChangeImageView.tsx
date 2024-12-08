import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Row } from "oriente"
import { useState } from "react"

import { useStore, useSpace } from "~/store"
import { Heading, Button } from "~/ui"
import Container from "~/ui/Container"
import ButtonsGrid from "~/ui/ButtonsGrid"
import emojis from "~/emojis"
import { Picture, colors } from "~/components/picture"

import { ActionState } from "~/ui/ActionStateView"

type ChangePictureViewProps = {
    title: React.ReactNode
    initialValue: Picture
    onClose: () => void
    onSave: (picture: Picture) => ActionState<void>
}

const ChangePictureView = observer((props: ChangePictureViewProps) => {
    const { title, initialValue, onClose, onSave } = props

    const [emoji, setEmoji] = useState<keyof typeof emojis>(
        initialValue.emoji as keyof typeof emojis
    )
    const [color, setColor] = useState<keyof typeof colors>(
        initialValue.color as keyof typeof colors
    )

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
                <Button onClick={onClose}>Cancel</Button>
                <Button>Save</Button>
            </ButtonsGrid>
        </Container>
    )
})

const ChangeUserPictureView = () => {
    const [_location, navigate] = useLocation()
    const store = useStore()
    return (
        <ChangePictureView
            initialValue={store.user.picture}
            title="Change user picture"
            onClose={() => navigate("/")}
            onSave={(picture) => store.changePicture(picture)}
        />
    )
}

const ChangeSpacePictureView = () => {
    const [_location, navigate] = useLocation()
    const spaceStore = useSpace()
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
