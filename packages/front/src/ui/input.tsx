import { forwardRef, useState, useRef, useEffect } from "react"
import type { MaskitoOptions } from "@maskito/core"
import { useMaskito } from "@maskito/react"

import {
    useStyles,
    StyleProps,
    StyleMap,
    omitStyleProps,
    mergeRefs
} from "oriente"

type InputHeight = "s" | "m"

interface InputProps
    extends StyleProps<[InputProps, boolean]>,
        Omit<
            React.InputHTMLAttributes<HTMLInputElement>,
            "value" | "onChange"
        > {
    value: string
    stretch?: boolean
    onChange?: (value: string) => void
    onFocus?: () => void
    onBlur?: () => void
    isDisabled?: boolean
    autoFocus?: boolean
    height?: InputHeight
}

const inputStyles = (props: InputProps, isFocused: boolean): StyleMap => ({
    root: {
        width: props.stretch ? "100%" : "auto",
        border: isFocused ? "2px solid white" : "2px solid #999",
        color: "var(--text-color)",
        fontSize: "1rem",
        background: "transparent",
        height: props.height === "s" ? 45 : 60,
        padding: "0 8px",
        boxSizing: "border-box",
        outline: "none"
    }
})

const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
    const { value, onChange, autoFocus, onFocus, onBlur, isDisabled, ...rest } =
        omitStyleProps(props)
    const [isFocused, setIsFocused] = useState(false)
    const styles = useStyles(inputStyles, [props, isFocused])

    const autofocusRef = useRef<HTMLInputElement | null>(null)
    useEffect(() => {
        if (autoFocus) {
            setTimeout(() => autofocusRef.current?.focus(), 0)
        }
    }, [])

    return (
        <input
            ref={mergeRefs(ref, autofocusRef)}
            type="text"
            {...rest}
            disabled={isDisabled}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            style={styles.root}
            onFocus={() => {
                setIsFocused(true)
                onFocus?.()
            }}
            onBlur={() => {
                setIsFocused(false)
                onBlur?.()
            }}
        />
    )
})

interface MaskedInputProps extends StyleProps<[MaskedInputProps, boolean]> {
    value: string
    stretch?: boolean
    onChange?: (value: string) => void
    isDisabled?: boolean
    mask?: MaskitoOptions
}

const MaskedInput = forwardRef<HTMLInputElement, MaskedInputProps>(
    (props, ref) => {
        const { value, onChange, mask, isDisabled, ...rest } =
            omitStyleProps(props)
        const maskitoRef = useMaskito({ options: mask })
        const [isFocused, setIsFocused] = useState(false)
        const styles = useStyles(inputStyles, [props, isFocused])
        return (
            <input
                ref={mergeRefs<HTMLInputElement>(maskitoRef, ref)}
                type="text"
                {...rest}
                disabled={isDisabled}
                value={value}
                // onChange={(e) => onChange?.(e.target.value)}
                onInput={(e) => onChange?.(e.currentTarget.value)}
                style={styles.root}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
            />
        )
    }
)

export { Input, MaskedInput }
