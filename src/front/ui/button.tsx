import { forwardRef, createElement } from 'react'

import {
    useTaply,
    TapState,
    useStyles,
    StyleProps,
    StyleMap,
    omitStyleProps,
    mergeRefs
} from 'oriente'

interface ButtonProps extends StyleProps<[ButtonProps, TapState]> {
    as?: React.ElementType
    children: React.ReactNode
    kind?: 'solid' | 'transparent' | 'faint'
    size?: 's' | 'm'
    onClick: () => void
    isDisabled?: boolean
    onChangeTapState?: (tapState: TapState) => void
}

const buttonStyles = (
    props: ButtonProps,
    { isFocused, isHovered, isPressed }: TapState
): StyleMap => {
    const size = props.size === 's' ? 45 : 60
    return {
        root: {
            color: isHovered
                ? 'var(--color-text)'
                : props.kind === 'faint'
                ? '#999'
                : 'var(--color-text)',
            textDecoration: 'none',
            height: size,
            minWidth: size,
            boxSizing: 'border-box',
            justifyContent: 'center',
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            cursor: props.isDisabled ? 'not-allowed' : 'pointer',
            outline: 'none',
            userSelect: 'none',
            background: isHovered
                ? '#666'
                : props.kind === 'transparent' || props.kind === 'faint'
                ? 'transparent'
                : '#555',
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
