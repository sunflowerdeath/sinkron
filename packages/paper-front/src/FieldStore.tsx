import NanoEvents from "nanoevents"
import { makeAutoObservable, untracked } from "mobx"
import { debounce, pickBy } from "lodash-es"

class CancelError extends Error {
    constructor() {
        super("Promise was cancelled")
        // @ts-ignore
        Error.captureStackTrace(this, CancelError)
    }
}

interface CancellablePromise<T> extends Promise<T> {
    cancel: () => void
}

const cancellable = <T,>(promise: Promise<T>): CancellablePromise<T> => {
    let rejectFn: Function
    const res = new Promise((resolve, reject) => {
        promise.then(resolve).catch(reject)
        rejectFn = reject
    })
    // @ts-ignore
    res.cancel = () => rejectFn(new CancelError())
    // @ts-ignore
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
    validations?: { [key: string]: (value: N) => boolean }
    asyncValidations?: { [key: string]: (value: N) => Promise<boolean> }
    asyncValidationDelay?: number
    validationErrorMessages: { [key: string]: ErrorMessage<N> }
    form: FormStore
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

    constructor(props: FieldStoreProps<V, N>) {
        const {
            initialValue,
            isEmpty,
            normalize,
            isRequired,
            requiredErrorMessage,
            validations,
            asyncValidations,
            asyncValidationDelay,
            validationErrorMessages,
            form
        } = props
        makeAutoObservable(this)
        // this.initialValue = initialValue
        this.props = props
        this.emitter = new NanoEvents()
        this.debouncedAsyncValidate = debounce(
            this.asyncValidate.bind(this),
            asyncValidationDelay === undefined ? 100 : asyncValidationDelay
        )
        this.change(initialValue)
    }

    on(...args) {
        return this.emitter.on(...args)
    }

    getRequiredErrorMessage() {
        return this.props.requiredErrorMessage
    }

    getValidationErrorMessage(validation: string) {
        const { props, normalizedValue } = this
        const message = props.validationErrorMessages[validation]
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
        this.setValue(this.props.initialValue)
        this.emitter.emit("reset")
        this.validate()
    }

    setValue(value: V) {
        const { props } = this
        this.value = value
        this.isEmpty = props.isEmpty
            ? props.isEmpty(value)
            : defaultIsEmpty(value)
        // @ts-ignore
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
        const { props, normalizedValue, isEmpty } = this

        const { form, validations } = props

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
            const syncValidations = Object.entries(validations).filter(
                ([_, validation]) => !validation.isAsync
            )
            for (const [name, validation] of syncValidations) {
                const isValid = validation.validate(
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
                Object.values(validations).some(
                    (validation) => validation.isAsync
                )
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
        const { props, normalizedValue } = this
        const { validations, form } = props
        const asyncValidations = Object.entries(validations).filter(
            ([name, validation]) => validation.isAsync
        )
        for (const [name, validation] of asyncValidations) {
            this.currentValidation = cancellable(
                validation.validate(
                    normalizedValue,
                    form && form.normalizedValues
                )
            )
            let isValid
            try {
                // eslint-disable-next-line no-await-in-loop
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

interface FormStoreProps {
    fields: object
    initialValues: object
}

class FormStore {
    fields: { [key: string]: FieldStore } = {}
    initialValues = {}

    constructor({ fields, initialValues }) {
        makeAutoObservable(this)
        this.fields = {}
        this.initialValues = initialValues || {}
        for (const [name, options] of Object.entries(fields)) {
            this.fields[name] = new FieldStore({
                name,
                ...options,
                initialValue: this.initialValues[name],
                form: this
            })
        }
    }

    get enabledFields() {
        return pickBy(this.fields, (field) => !field.isDisabled)
    }

    get values() {
        const result = {}
        for (const [name, field] of Object.entries(this.enabledFields)) {
            result[name] = field.value
        }
        return result
    }

    get normalizedValues() {
        const result = {}
        for (const [name, field] of Object.entries(this.enabledFields)) {
            result[name] = field.normalizedValue
        }
        return result
    }

    get isValid() {
        return Object.values(this.enabledFields).every(
            (field) => !field.isValidating && field.isValid
        )
    }

    get isValidating() {
        return Object.values(this.enabledFields).some(
            (field) => field.isValidating
        )
    }

    reset() {
        for (const field of Object.values(this.fields)) {
            field.reset()
        }
    }

    setErrors(errors) {
        for (const [field, error] of Object.entries(errors)) {
            this.fields[field].setError(error)
        }
    }
}

export default FormStore
