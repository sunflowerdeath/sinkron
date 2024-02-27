import { forwardRef, useState } from 'react'

import {
    useStyles,
    StyleProps,
    StyleMap,
    omitStyleProps,
    mergeRefs
} from 'oriente'

interface InputProps extends StyleProps<[InputProps, boolean]> {
    value: string
    stretch?: boolean
    onChange?: (value: string) => void
    isDisabled?: boolean
}

const inputStyles = (props: InputProps, isFocused: boolean): StyleMap => ({
    root: {
        width: props.stretch ? '100%' : 'auto',
        border: isFocused ? '2px solid white' : '2px solid #999',
        color: 'var(--text-color)',
        fontSize: '1rem',
        background: 'transparent',
        height: 60,
        padding: '0 8px',
        boxSizing: 'border-box',
        outline: 'none'
    }
})

const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
    const { value, onChange, isDisabled, ...rest } = omitStyleProps(props)
    const [isFocused, setIsFocused] = useState(false)
    const styles = useStyles(inputStyles, [props, isFocused])
    return (
        <input
            ref={ref}
            type="text"
            {...rest}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            style={styles.root}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
        />
    )
})

export { Input }
