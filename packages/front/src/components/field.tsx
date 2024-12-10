import { observer } from "mobx-react-lite"

import { FieldStore, useShowError, ShowErrorMode } from "~/utils/forms"

export interface FieldProps {
    field: FieldStore<any, any>
    showRequiredError?: ShowErrorMode
    showValidationErrors?: ShowErrorMode | { [key: string]: ShowErrorMode }
    children: ({
        inputProps,
        error
    }: {
        inputProps: any
        error?: React.ReactNode
    }) => React.ReactNode
}

const Field = observer((props: FieldProps) => {
    const {
        field,
        showRequiredError = "onBlurTouched",
        showValidationErrors = "onBlurTouched",
        children
    } = props
    const { showError, onFocus, onBlur } = useShowError({
        field,
        showRequiredError,
        showValidationErrors
    })
    const inputProps = {
        value: field.value,
        onChange: (value: string) => field.change(value),
        onFocus,
        onBlur
        // hasError: showError
    }
    return children({
        inputProps,
        error: showError ? field.error!.message : undefined
    })
})

export { Field }
