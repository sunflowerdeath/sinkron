interface IconProps {
    size?: number
    height?: number
    fill?: string
    svg: string
    style?: React.CSSProperties
}

const defaultIconProps = {
    size: 24,
    fill: "currentColor",
}

const Icon = (inProps: IconProps) => {
    const props = { ...defaultIconProps, ...inProps }
    const { svg, size, fill, style } = props
    return (
        <div
            style={{ width: size, height: size, fill, ...style }}
            dangerouslySetInnerHTML={{ __html: svg }}
            className="icon"
        />
    )
}

export { Icon }
