import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Row, Flex } from "oriente"
import { useState } from "react"

import { useStore } from "~/store"
import Container from "~/ui/Container"
import { Heading, Button, LinkButton, Avatar } from "~/ui"
import ButtonsGrid from "~/ui/ButtonsGrid"

import emojis from "~/emojis"

const colors = {
    signal_yellow: "#F9A900",
    bright_red_orange: "#d66c21",
    carmine_red: "#8d1f24",
    traffic_purple: "#852e6f",
    signal_blue: "#005387",
    cyan: "#0097a7",
    bright_green: "#008B29",
    grey: "var(--color-elem)",
    traffic_black: "#262625",
    cream: "#e5e1d4"
}

const ChangeImageView = observer(() => {
    const [_location, navigate] = useLocation()
    const store = useStore()

    const [emoji, setEmoji] = useState<keyof typeof emojis>(
        "slightly_smiling_face"
    )
    const [color, setColor] = useState<keyof typeof colors>("grey")

    const colorElems = Object.entries(colors).map(([key, color]) => (
        <div
            style={{ width: 45, height: 45, background: color }}
            onClick={() => setColor(key as keyof typeof colors)}
        />
    ))

    const imageElems = Object.entries(emojis).map(([key, url]) => (
        <Button
            size="s"
            style={{ width: 45, alignItems: "center" }}
            onClick={() => setEmoji(key as keyof typeof emojis)}
        >
            <img
                src={url}
                style={{ height: 32, imageRendering: "pixelated" }}
            />
        </Button>
    ))

    return (
        <Container
            title="Change image"
            onClose={() => navigate("/")}
            style={{ height: "100dvh", overflow: "hidden" }}
            styles={{ content: { paddingBottom: 8 } }}
        >
            <Row
                style={{
                    width: 100,
                    height: 100,
                    alignSelf: "center",
                    background: colors[color]
                }}
                align="center"
                justify="center"
            >
                <img
                    src={emojis[emoji]}
                    style={{ height: 64, imageRendering: "pixelated" }}
                />
            </Row>
            <Heading>Color</Heading>
            <Row gap={8} wrap={true}>
                {colorElems}
            </Row>
            <Heading>Image</Heading>
            <Row
                gap={8}
                wrap={true}
                className="scrollbar"
                style={{ overflowY: "scroll", flexGrow: 1, flexBasis: 0 }}
            >
                {imageElems}
            </Row>
            <ButtonsGrid>
                <Button>Cancel</Button>
                <Button>Save</Button>
            </ButtonsGrid>
        </Container>
    )
})

export default ChangeImageView
