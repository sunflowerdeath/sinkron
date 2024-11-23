import { useState, useEffect, useRef } from "react"
import { createNanoEvents } from "nanoevents"
import { makeAutoObservable, untracked } from "mobx"
import { debounce } from "lodash-es"

class CancelError extends Error {
    constructor() {
        super("Promise was cancelled")
    }
}

interface CancellablePromise<T> extends Promise<T> {
    cancel: () => void
}

const cancellable = <T>(promise: Promise<T>): CancellablePromise<T> => {
    let rejectFn: (e: Error) => void
    const res = new Promise((resolve, reject) => {
        promise.then(resolve).catch(reject)
        rejectFn = reject
    }) as CancellablePromise<T>
    res.cancel = () => rejectFn(new CancelError())
    return res
}

const defaultIsEmpty = (value: any) =>
    value === null || value === undefined || value === ""

type ErrorMessage<T> = React.ReactNode | ((value: T) => React.ReactNode)

interface FieldStoreProps<V, N = V> {
    initialValue?: V
    isEmpty?: (value: V) => boolean
    normalize?: (value: V) => N
    isRequired?: boolean
    requiredErrorMessage?: React.ReactNode
    validations?: {
        [key: string]: (value: N, formValues: object | undefined) => boolean
    }
    asyncValidations?: {
        [key: string]: (
            value: N,
            formValues: object | undefined
        ) => Promise<boolean>
    }
    asyncValidationDelay?: number
    errorMessages: { [key: string]: ErrorMessage<N> }
}

type ValidationError =
    | { kind: "required"; message: React.ReactNode }
    | { kind: "validation"; validation: string; message: React.ReactNode }
    | { kind: "external"; message: React.ReactNode }

class FieldStore<V = string, N = V> {
    props: FieldStoreProps<V, N>
    isDisabled: boolean = false
    value!: V
    isEmpty: boolean = false
    normalizedValue!: N
    isValidating: boolean = false
    isValid: boolean = false
    error: ValidationError | undefined = undefined
    form?: FormStore<any>
    emitter: ReturnType<typeof createNanoEvents>

    debouncedAsyncValidate: ReturnType<typeof debounce>
    currentValidation?: CancellablePromise<boolean>

    constructor(props: FieldStoreProps<V, N>) {
        const { initialValue, asyncValidationDelay } = props
        makeAutoObservable(this)
        this.props = props
        this.emitter = createNanoEvents()
        this.debouncedAsyncValidate = debounce(
            this.asyncValidate.bind(this),
            asyncValidationDelay === undefined ? 100 : asyncValidationDelay
        )
        // Assume that V should allow "undefined", when "initialValue" is
        // not provided
        this.change(initialValue as V)
    }

    on(event: string, cb: (data: any) => void) {
        return this.emitter.on(event, cb)
    }

    getRequiredErrorMessage() {
        return this.props.requiredErrorMessage
    }

    getValidationErrorMessage(validation: string) {
        const { props, normalizedValue } = this
        const message = props.errorMessages[validation]
        return typeof message === "function"
            ? message(normalizedValue)
            : message
    }

    change(value: V) {
        this.setValue(value)
        this.emitter.emit("change")
        this.validate()
    }

    reset() {
        this.setValue(this.props.initialValue as V)
        this.emitter.emit("reset")
        this.validate()
    }

    setValue(value: V) {
        const { props } = this
        this.value = value
        this.isEmpty = props.isEmpty
            ? props.isEmpty(value)
            : defaultIsEmpty(value)
        // @ts-expect-error type
        this.normalizedValue = props.normalize ? props.normalize(value) : value
    }

    cancelValidation() {
        if (this.isValidating) {
            this.debouncedAsyncValidate.cancel()
            if (this.currentValidation) this.currentValidation.cancel()
            this.isValidating = false
        }
    }

    validate() {
        const { props, form, normalizedValue, isEmpty } = this

        this.cancelValidation()

        if (isEmpty) {
            if (props.isRequired) {
                this.isValid = false
                this.error = {
                    kind: "required",
                    message: this.getRequiredErrorMessage()
                }
            } else {
                this.isValid = true
                this.error = undefined
            }
            this.emitter.emit("validate")
            return
        }

        if (props.validations) {
            for (const name in props.validations) {
                const validation = props.validations[name]
                const isValid = validation(
                    normalizedValue,
                    form && untracked(() => form.normalizedValues)
                )
                if (!isValid) {
                    this.isValid = false
                    this.error = {
                        kind: "validation",
                        validation: name,
                        message: this.getValidationErrorMessage(name)
                    }
                    this.emitter.emit("validate")
                    return
                }
            }

            if (
                props.asyncValidations &&
                Object.keys(props.asyncValidations).length > 0
            ) {
                this.isValidating = true
                this.debouncedAsyncValidate()
                return
            }
        }

        this.isValid = true
        this.error = undefined
        this.emitter.emit("validate")
    }

    async asyncValidate() {
        const { props, form, normalizedValue } = this
        const { asyncValidations } = props
        for (const name in asyncValidations) {
            const validation = asyncValidations[name]
            this.currentValidation = cancellable(
                validation(
                    normalizedValue,
                    form && untracked(() => form.normalizedValues)
                )
            )
            let isValid
            try {
                isValid = await this.currentValidation
            } catch (error) {
                if (error instanceof CancelError) return
                // TODO handle errors
                console.log(error)
                return
            }
            this.currentValidation = undefined
            if (!isValid) {
                this.isValidating = false
                this.isValid = false
                this.error = {
                    kind: "validation",
                    validation: name,
                    message: this.getValidationErrorMessage(name)
                }
                this.emitter.emit("validate")
                return
            }
        }

        this.isValidating = false
        this.isValid = true
        this.error = undefined
        this.emitter.emit("validate")
    }

    setError(message: React.ReactNode) {
        this.isValid = false
        this.error = { kind: "external", message }
        this.emitter.emit("validate")
    }

    clearError() {
        this.isValid = true
        this.error = undefined
    }

    setValidating(isValidating: boolean) {
        this.isValidating = isValidating
    }

    disable() {
        this.isDisabled = true
    }

    enable() {
        this.isDisabled = false
    }
}

type ShapeFields<
    Shape extends object,
    NormalizedShape extends Partial<Shape> = Shape
> = { [key in keyof Shape]: FieldStore<Shape[key], NormalizedShape[key]> }

class FormStore<
    Shape extends object,
    NormalizedShape extends Partial<Shape> = Shape
> {
    fields: ShapeFields<Shape, NormalizedShape>

    constructor({ fields }: { fields: ShapeFields<Shape, NormalizedShape> }) {
        this.fields = fields

        let key: keyof typeof this.fields
        for (key in this.fields) {
            const field = this.fields[key]
            field.form = this
        }
    }

    get enabledFields(): Partial<typeof this.fields> {
        const result: Partial<typeof this.fields> = {}
        let key: keyof typeof this.fields
        for (key in this.fields) {
            const field = this.fields[key]
            if (!field.isDisabled) result[key] = field
        }
        return result
    }

    get values(): Partial<Shape> {
        const result: Partial<Shape> = {}
        let key: keyof typeof this.fields
        for (key in this.enabledFields) {
            const field = this.enabledFields[key]
            if (field) result[key] = field.value
        }
        return result
    }

    get normalizedValues(): Partial<Shape> & Partial<NormalizedShape> {
        const result: Partial<Shape> & Partial<NormalizedShape> = {}
        let key: keyof typeof this.fields
        for (key in this.enabledFields) {
            const field = this.enabledFields[key]
            if (field) result[key] = field.normalizedValue
        }
        return result
    }

    get isValid() {
        let key: keyof typeof this.fields
        for (key in this.enabledFields) {
            const field = this.enabledFields[key]
            if (field) {
                if (field.isValidating || !field.isValid) return false
            }
        }
        return true
    }

    get isValidating() {
        let key: keyof typeof this.fields
        for (key in this.enabledFields) {
            const field = this.enabledFields[key]
            if (field) {
                if (field.isValidating) return true
            }
        }
        return false
    }

    reset() {
        let key: keyof typeof this.fields
        for (key in this.fields) {
            const field = this.fields[key]
            field.reset()
        }
    }

    setErrors(errors: { [key in keyof Shape]?: React.ReactNode }) {
        let key: keyof typeof this.fields
        for (key in errors) {
            const error = errors[key]
            const field = this.fields[key]
            field.setError(error)
        }
    }
}

export type ShowErrorMode =
    | "off"
    | "onChange"
    | "onBlur"
    | "onChangeTouched"
    | "onBlurTouched"

interface ShowErrorState {
    isFocused: boolean
    isTouched: boolean
    showError: boolean
}

export interface ShowErrorProps {
    field: FieldStore<any, any>
    showValidationErrors: ShowErrorMode | { [key: string]: ShowErrorMode }
    showRequiredError: ShowErrorMode
}

const shouldShowError = (props: ShowErrorProps, state: ShowErrorState) => {
    const { field, showValidationErrors, showRequiredError } = props
    const { isValid, error } = field
    const { isFocused, isTouched } = state

    if (isValid || error === undefined) return false

    let showMode
    if (error.kind === "external") {
        showMode = "onChange"
    } else if (error.kind === "required") {
        showMode = showRequiredError
    } else if (typeof showValidationErrors === "object") {
        showMode =
            error.validation in showValidationErrors
                ? showValidationErrors[error.validation]
                : "onChange"
    } else {
        showMode = showValidationErrors
    }

    if (showMode === "onChange") return true
    else if (showMode === "onChangeTouched") return isTouched
    else if (showMode === "onBlur") return !isFocused
    else if (showMode === "onBlurTouched") return !isFocused && isTouched
    /* else if (showMode === "off") */
    return false
}

const useLastValue = <T>(value: T) => {
    const ref = useRef<T>(value)
    if (ref.current !== value) ref.current = value
    return () => ref.current
}

const useShowError = (props: ShowErrorProps) => {
    const getProps = useLastValue(props)

    const [state, setState] = useState<ShowErrorState>({
        isFocused: false,
        isTouched: false,
        showError: false
    })

    useEffect(() => {
        const unbindReset = props.field.on("reset", () =>
            setState((currentState) => ({
                ...currentState,
                isTouched: false
            }))
        )
        const unbindValidate = props.field.on("validate", () => {
            setState((currentState) => ({
                ...currentState,
                showError: shouldShowError(getProps(), currentState)
            }))
        })
        return () => {
            unbindReset()
            unbindValidate()
        }
    }, [props.field])

    const onFocus = () => {
        setState((currentState) => ({
            ...currentState,
            isFocused: true,
            isTouched: true
        }))
    }

    const onBlur = () => {
        setState((currentState) => {
            const nextState = { ...currentState, isFocused: false }
            return {
                ...currentState,
                showError: shouldShowError(props, nextState)
            }
        })
    }

    return { ...state, onBlur, onFocus }
}

export { FieldStore, FormStore, useShowError }
