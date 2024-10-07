import { useMemo } from "react"
import { fromPromise } from "mobx-utils"
import { observer } from "mobx-react-lite"
import { useLocation } from "wouter"
import { Col } from "oriente"

import {
    FormStore,
    FieldStore,
    useShowError,
    ShowErrorMode
} from "../utils/forms"
import { useStore } from "../store"
import { Button, Input, Heading, useStateToast, useActionState } from "../ui"
import Container from "../ui/Container"

interface FieldProps {
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
        onBlur,
        hasError: showError
    }
    return children({
        inputProps,
        error: showError ? field.error!.message : undefined
    })
})

type FormShape = { name: string }

type CreateSpaceViewProps = {
    container: boolean
}

const CreateSpaceView = observer((props: CreateSpaceViewProps) => {
    const { container } = props
    const store = useStore()

    const form = useMemo(
        () =>
            new FormStore<FormShape>({
                fields: {
                    name: new FieldStore({
                        initialValue: "",
                        isRequired: true,
                        requiredErrorMessage: "Name should not be empty",
                        validations: {
                            noSpaces: (val: string) =>
                                !val.match(/(^\s+)|(\s+$)/g)
                        },
                        errorMessages: {
                            noSpaces: "Name can't start or end with a space"
                        }
                    })
                }
            }),
        []
    )

    const [_location, navigate] = useLocation()
    const toast = useStateToast()

    const [createState, setCreateState] = useActionState<void>()
    const create = async () => {
        const state = fromPromise(store.createSpace(form.values.name!))
        state.then(
            () => {
                navigate("/")
            },
            (e) => {
                toast.error(<>Couldn't create space: {e.message}</>)
            }
        )
        setCreateState(state)
    }

    const content = (
        <>
            <Field
                field={form.fields.name}
                showValidationErrors="onChange"
                showRequiredError="off"
            >
                {({ inputProps, error }) => (
                    <Col
                        gap={8}
                        align="normal"
                        style={{ alignSelf: "stretch" }}
                    >
                        Name
                        <Input autoFocus {...inputProps} maxLength={25} />
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
                isDisabled={!form.isValid || createState.state === "pending"}
                style={{ alignSelf: "stretch" }}
            >
                Create
            </Button>
        </>
    )

    if (container) {
        return (
            <Container title="Create space" onClose={() => navigate("/")}>
                {content}
            </Container>
        )
    } else {
        return (
            <Col
                align="normal"
                justify="center"
                style={{
                    height: "100%",
                    width: 320,
                    margin: "auto",
                    paddingTop: "4rem"
                }}
                gap={16}
            >
                <Heading>Create space</Heading>
                {content}
                <Button kind="transparent" onClick={() => store.logout()}>
                    Logout
                </Button>
            </Col>
        )
    }
})

export default CreateSpaceView
