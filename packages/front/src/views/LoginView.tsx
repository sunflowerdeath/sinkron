import { useState } from "react"
import { observer } from "mobx-react-lite"
import { fromPromise, IPromiseBasedObservable } from "mobx-utils"
import { Col } from "oriente"

import logoSvg from "../logo.svg"
import { AuthStore } from "../store"
import { Button, Input, Icon } from "../ui"

const validateEmail = (s: string) => s.match(/^.+@.+\..+$/g) !== null // a@a.a

interface EmailStepProps {
    store: AuthStore
    onComplete: (id: string) => void
}

const EmailStep = observer((props: EmailStepProps) => {
    const { store, onComplete } = props

    const [email, setEmail] = useState("")
    const isValid = validateEmail(email)
    const [state, setState] = useState<IPromiseBasedObservable<any>>(
        fromPromise.resolve()
    )

    const login = () => {
        const state = store.login(email)
        state.then(({ id }) => onComplete(id))
        setState(fromPromise(state))
    }

    const onKeyPress = (event: KeyboardEvent) => {
        if (event.key === "Enter") {
            if (isValid) login()
        }
    }

    return (
        <>
            <div style={{ height: "3rem" }}>
                {state.state === "rejected" && (
                    <div style={{ color: "var(--color-error)" }}>
                        {state.value.message}
                    </div>
                )}
            </div>
            <Col gap={4}>
                Enter your email address
                <Input
                    value={email}
                    onChange={setEmail}
                    style={{ width: "100%" }}
                    onKeyPress={onKeyPress}
                    autoFocus
                />
            </Col>
            <Button
                style={{ alignSelf: "stretch" }}
                onClick={login}
                isDisabled={!isValid || state.state === "pending"}
            >
                Continue
            </Button>
        </>
    )
})

interface CodeStepProps {
    store: AuthStore
    id: string
    onGoBack: () => void
}

const CodeStep = observer((props: CodeStepProps) => {
    const { store, id, onGoBack } = props

    const [code, setCode] = useState("")
    const isValid = code.length === 6
    const [state, setState] = useState<IPromiseBasedObservable<any>>(
        fromPromise.resolve()
    )

    const sendCode = () => {
        const state = store.code(id, code)
        setState(fromPromise(state))
    }

    const onKeyPress = (event: KeyboardEvent) => {
        if (event.key === "Enter") {
            if (isValid) sendCode()
        }
    }

    return (
        <>
            <div style={{ height: "3rem" }}>
                {state.state === "rejected" && (
                    <div style={{ color: "var(--color-error)" }}>
                        {state.value.message}
                    </div>
                )}
            </div>
            <Col gap={4}>
                Enter code from your email
                <Input
                    value={code}
                    onChange={setCode}
                    style={{ width: "100%" }}
                    onKeyPress={onKeyPress}
                    autoFocus
                />
            </Col>
            <Button
                style={{ alignSelf: "stretch" }}
                onClick={sendCode}
                isDisabled={!isValid || state.state === "pending"}
            >
                Continue
            </Button>
            <Button
                style={{ alignSelf: "stretch" }}
                onClick={onGoBack}
                kind="transparent"
            >
                Go back
            </Button>
        </>
    )
})

interface LoginViewProps {
    store: AuthStore
}

const LoginView = observer((props: LoginViewProps) => {
    const { store } = props
    const [step, setStep] = useState<"email" | "code">("email")
    const [id, setId] = useState("")

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
            <Icon
                svg={logoSvg}
                style={{
                    alignSelf: "center",
                    width: 200,
                    opacity: 0.5,
                    marginBottom: "2rem"
                }}
                fill="var(--color-secondary)"
            />
            {step === "email" ? (
                <EmailStep
                    store={store}
                    onComplete={(id) => {
                        setId(id)
                        setStep("code")
                    }}
                />
            ) : (
                <CodeStep
                    id={id}
                    store={store}
                    onGoBack={() => setStep("email")}
                />
            )}
        </Col>
    )
})

export { LoginView }
