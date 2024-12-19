import type { Picture as PictureEntity } from "~/entities"
import { emojis } from "~/emojis"

export type PictureSize = "s" | "m" | "l"

export type PictureProps = {
    picture?: PictureEntity
    size?: PictureSize
    style?: React.CSSProperties
}

const defaultProps = {
    size: "s" as PictureSize
}

const sizes: { [key in PictureSize]: number } = {
    s: 45,
    m: 60,
    l: 100
}

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

const missingPicture = {
    color: "grey",
    emoji: "cross_mark"
}

const Picture = (inProps: PictureProps) => {
    const { picture, size, style } = { ...defaultProps, ...inProps }
    const sizeVal = sizes[size]
    const { emoji, color } = picture || missingPicture

    const background =
        color in colors ? colors[color as keyof typeof colors] : colors.grey

    const img =
        emoji in emojis ? (
            <img
                src={emojis[emoji as keyof typeof emojis]}
                style={{
                    height: "68%",
                    imageRendering: "pixelated"
                }}
            />
        ) : null

    return (
        <div
            style={{
                width: sizeVal,
                height: sizeVal,
                flexShrink: 0,
                background,
                alignItems: "center",
                justifyContent: "center",
                display: "flex",
                ...style
            }}
        >
            {img}
        </div>
    )
}

export { Picture, colors }
