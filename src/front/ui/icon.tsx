interface IconProps {
    size?: number
    height?: number
    fill?: string
    svg: string
}

const defaultIconProps = {
    size: 24,
    fill: "currentColor",
}

const Icon = (inProps: IconProps) => {
    const props = { ...defaultIconProps, ...inProps }
    const { svg, size, fill } = props
    return (
        <div
            style={{ width: size, height: size, fill }}
            dangerouslySetInnerHTML={{ __html: svg }}
            className="icon"
        />
    )
}

export { Icon }
