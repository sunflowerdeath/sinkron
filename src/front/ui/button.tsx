import { forwardRef, createElement } from "react"

import {
    useTaply,
    TapState,
    useStyles,
    StyleProps,
    StyleMap,
    omitStyleProps,
    mergeRefs,
} from 'oriente'

interface ButtonProps extends StyleProps<[ButtonProps, TapState]> {
    as?: React.ElementType
    children: React.ReactNode
    onClick: () => void
    isDisabled?: boolean
    onChangeTapState?: (tapState: TapState) => void
}

const buttonStyles = (
    props: ButtonProps,
    { isFocused, isHovered, isPressed }: TapState
): StyleMap => {
    return {
        root: {
            color: 'var(--color-text)',
            textDecoration: 'none',
            height: 60,
            minWidth: 60,
            boxSizing: 'border-box',
            justifyContent: 'center',
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            cursor: props.isDisabled ? 'not-allowed' : 'pointer',
            outline: 'none',
            userSelect: 'none',
            background: isHovered ? '#666' : '#555',
            opacity: props.isDisabled ? 0.5 : 1,
            boxShadow: isFocused ? 'inset 0 0 0 2px #ccc' : 'none',
            WebkitTapHighlightColor: 'transparent'
        }
    }
}

const Button = forwardRef((props: ButtonProps, ref) => {
    const { as, children, onClick, isDisabled, onChangeTapState, ...rest } =
        props
    const Component = as || 'div'
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

export { Button }
