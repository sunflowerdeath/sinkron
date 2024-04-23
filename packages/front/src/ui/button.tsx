import { forwardRef, createElement } from "react"
import { Link } from "wouter"

import {
    useTaply,
    TapState,
    useStyles,
    StyleProps,
    StyleMap,
    mergeRefs
} from "oriente"

interface ButtonProps extends StyleProps<[ButtonProps, TapState]> {
    as?: React.ElementType
    children: React.ReactNode
    kind?: "solid" | "transparent" | "faint"
    size?: "s" | "m"
    onClick?: () => void
    isDisabled?: boolean
    onChangeTapState?: (tapState: TapState) => void
}

const buttonStyles = (
    props: ButtonProps,
    { isFocused, isHovered }: TapState
): StyleMap => {
    const size = props.size === "s" ? 45 : 60
    return {
        root: {
            color:
                props.kind === "faint"
                    ? isHovered
                        ? "var(--color-text)"
                        : "var(--color-secondary)"
                    : "var(--color-text)",
            textDecoration: "none",
            height: size,
            flexShrink: 0,
            minWidth: size,
            boxSizing: "border-box",
            justifyContent: "center",
            padding: "0 8px",
            display: "flex",
            alignItems: "center",
            cursor: props.isDisabled ? "not-allowed" : "pointer",
            outline: "none",
            userSelect: "none",
            background: isHovered
                ? "var(--color-hover)"
                : props.kind === "transparent" || props.kind === "faint"
                ? "transparent"
                : "var(--color-elem)",
            opacity: props.isDisabled ? 0.5 : 1,
            boxShadow: isFocused ? "inset 0 0 0 2px #ccc" : "none",
            WebkitTapHighlightColor: "transparent"
        }
    }
}

const Button = forwardRef((props: ButtonProps, ref) => {
    const { as, children, onClick, isDisabled, onChangeTapState, ...rest } =
        props
    const Component = as || "div"
    const { tapState, render } = useTaply({
        onClick,
        isDisabled,
        onChangeTapState
    })
    const styles = useStyles(buttonStyles, [props, tapState])
    return render((attrs, taplyRef) => {
        return createElement(
            Component,
            {
                ...rest,
                style: styles.root,
                ...attrs,
                ref: mergeRefs(ref, taplyRef)
            },
            children
        )
    })
})

interface LinkButtonProps extends Omit<ButtonProps, "as"> {
    to: string
}

const LinkButton = forwardRef((props: LinkButtonProps) => {
    const { to, ...rest } = props
    return <Button as={Link} to={to} {...rest} />
})

export { Button, LinkButton }
