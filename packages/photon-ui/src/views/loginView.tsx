import { observer } from "mobx-react-lite"
import { fromPromise, IPromiseBasedObservable } from "mobx-utils"
import React from "react"
import { useState } from "react"

import { validateEmail } from "../common/validations"
import { Col, Button, Input } from "../ui"

type Otp = {
    id: string
    email: string
}

type EmailStepProps = {
    onComplete: (otp: Otp) => void
}

const EmailStep = (props: EmailStepProps) => {
    const { onComplete } = props

    const [email, setEmail] = useState("")
    const isValid = validateEmail(email)
    const [loginState, setLoginState] = useState<IPromiseBasedObservable<any>>(
        fromPromise.resolve(),
    )
    const login = () => {
        const state = store.login(email)
        state.then((otp) => onComplete(otp))
        setLoginState(fromPromise(state))
    }

    return (
        <>
            <Col gap={4}>
                Enter your email adress:
                <Input
                    value={email}
                    onChange={setEmail}
                    style={{ width: "100%" }}
                />
            </Col>
            <Button
                onClick={() => login()}
                isDisabled={!isValid || loginState.state === "pending"}
            >
                Continue
            </Button>
        </>
    )
}

type CodeStepProps = {
    otp: Otp
    onGoBack: () => void
}

const CodeStep = (props: CodeStepProps) => {
    const { onGoBack, otp } = props

    const [code, setCode] = useState("")
    const isValid = code.length === 6
    const [sendCodeState, setSendCodeState] = useState<
        IPromiseBasedObservable<any>
    >(fromPromise.resolve())

    const sendCode = () => {
        const state = store.sendCode(code)
        setSendCodeState(fromPromise(state))
    }

    const onKeyPress = (event: React.KeyboardEvent) => {
        if (event.key === "Enter") {
            if (isValid) sendCode()
        }
    }

    return (
        <>
            <Col gap={4}>
                <Col gap={4}>
                    Enter code from your email:
                    <div style={{ color: "var(--color-secondary)" }}>
                        Code has been sent to "{otp.email}"
                    </div>
                </Col>
                <Input
                    value={code}
                    onChange={setCode}
                    style={{ width: "100%" }}
                    onKeyPress={onKeyPress}
                    autoFocus
                />
            </Col>
            <Button
                onClick={sendCode}
                isDisabled={!isValid || sendCodeState.state === "pending"}
            >
                Continue
            </Button>
            <Button onClick={onGoBack} kind="transparent">
                Use another email
            </Button>
        </>
    )
}

type LoginState = { step: "email" } | { step: "code"; otp: Otp }

const LoginView = observer(() => {
    const [loginState, setLoginState] = useState<LoginState>({ step: "email" })
    return (
        <Col
            align="normal"
            justify="center"
            style={{
                height: "100%",
                width: 320,
                margin: "auto",
                paddingTop: "3rem",
            }}
            gap={16}
        >
            Photon
            {loginState.step === "email" ? (
                <EmailStep
                    onComplete={(otp: Otp) =>
                        setLoginState({ step: "code", otp })
                    }
                />
            ) : (
                <CodeStep
                    onGoBack={() => setLoginState({ step: "email" })}
                    otp={loginState.otp}
                />
            )}
        </Col>
    )
})

export { LoginView }
