import { useState, useMemo } from "react"
import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { FormStore, useShowError } from "shadowform"

import { Col } from "oriente"

import { fetchJson, FetchError } from "../fetchJson"
import { useStore, Space } from "../store"
import { Result, ResultType } from "../../utils/result"

import { Heading } from "../ui/heading"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import Container from "../ui/Container"
import ButtonsGrid from "../ui/ButtonsGrid"

interface InputProps<T = string> {
    value: T
    onChange: (value: T) => void
    onFocus: () => void
    onBlur: () => void
    hasError: boolean
}

interface FieldProps {
    field: any
    showRequiredError?: any
    showValidationErrors?: any
    children: ({
        inputProps,
        error
    }: {
        inputProps: any
        error?: string
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
        onBlur,
        hasError: showError
    }
    return children({
        inputProps,
        error: showError ? field.error.value : undefined
    })
})

const CreateSpaceView = observer(() => {
    const store = useStore()

    const form = useMemo(
        () =>
            new FormStore({
                fields: {
                    name: {
                        isRequired: true,
                        requiredError: "Name should not be empty",
                        validations: {
                            spaces: {
                                validate: (val: string) =>
                                    !val.match(/(^\s+)|(\s+$)/g),
                                error: "Name can't start or end with a space"
                            }
                        }
                    }
                },
                initialValues: {
                    name: ""
                }
            }),
        []
    )

    const [location, navigate] = useLocation()

    const [createState, setCreateState] = useState<IPromiseBasedObservable<
        ResultType<object, FetchError>
    > | null>(null)
    const create = async () => {
        const state = store.createSpace(form.values.name)
        setCreateState(state)
        const res = await state
        if (res.isOk) {
            const space = res.value as Space
            store.user.spaces.push(space)
            store.changeSpace(space.id)
            navigate("/")
        } else {
            alert(res.error)
        }
    }

    return (
        <Container title="Create space" onClose={() => navigate("/")}>
            <Field field={form.fields.name} showValidationErrors="onChange">
                {({ inputProps, error }) => (
                    <Col gap={8} style={{ alignSelf: "stretch" }}>
                        Name
                        <Input
                            style={{ width: 400 }}
                            autoFocus
                            {...inputProps}
                        />
                        {error && (
                            <div style={{ color: "var(--color-error)" }}>
                                {error}
                            </div>
                        )}
                    </Col>
                )}
            </Field>
            <Button
                onClick={create}
                isDisabled={!form.isValid || createState?.state === "pending"}
                style={{ alignSelf: "stretch" }}
            >
                Create
            </Button>
        </Container>
    )
})

export default CreateSpaceView
