import { useState } from "react"
import { observer } from "mobx-react-lite"
import { fromPromise, IPromiseBasedObservable } from "mobx-utils"
import { Col } from "oriente"
import { Link } from "wouter"

import { AuthStore } from "../store"
import { Button, Input, Icon, Heading } from "../ui"
import logoSvg from "../logo.svg"

interface LoginViewProps {
    store: AuthStore
}

const LoginView = observer((props: LoginViewProps) => {
    const [login, setLogin] = useState("")
    const [password, setPassword] = useState("")

    const isValid = login.length > 0 && password.length > 0

    const [authState, setAuthState] = useState<IPromiseBasedObservable<any>>(
        fromPromise.resolve()
    )
    const auth = () => {
        const state = props.store.login({ name: login, password })
        setAuthState(fromPromise(state))
    }

    const onKeyPress = (event) => {
        if (event.key === "Enter") {
            if (isValid) auth()
        }
    }

    return (
        <Col
            align="normal"
            justify="center"
            style={{
                height: "100%",
                width: 320,
                margin: "auto",
                paddingTop: 36
            }}
            gap={16}
        >
            <Icon
                svg={logoSvg}
                style={{
                    marginBottom: 32,
                    alignSelf: "center",
                    width: 200,
                    opacity: 0.5
                }}
                fill="var(--color-secondary)"
            />
            <Heading style={{ alignSelf: "center" }}>Log In</Heading>
            {authState.state === "rejected" && (
                <div style={{ color: "var(--color-error)" }}>
                    {authState.value.message}
                </div>
            )}
            <Col gap={4}>
                Username
                <Input
                    value={login}
                    onChange={setLogin}
                    style={{ width: "100%" }}
                />
            </Col>
            <Col gap={4}>
                Password
                <Input
                    value={password}
                    onChange={setPassword}
                    style={{ width: "100%" }}
                    onKeyPress={onKeyPress}
                />
            </Col>
            <Button
                style={{ alignSelf: "stretch" }}
                onClick={auth}
                isDisabled={!isValid || authState.state === "pending"}
            >
                Log in
            </Button>
            <Button kind="transparent" as={Link} to="/signup">
                Create account
            </Button>
        </Col>
    )
})

const SignupView = observer((props: LoginViewProps) => {
    const [login, setLogin] = useState("")
    const [password, setPassword] = useState("")

    const isValid = login.length > 0 && password.length > 0

    const [signupState, setSignupState] = useState<
        IPromiseBasedObservable<any>
    >(fromPromise.resolve())
    const signup = () => {
        const state = props.store.signup({ name: login, password })
        setSignupState(fromPromise(state))
    }

    return (
        <Col
            align="normal"
            justify="center"
            style={{
                height: "100%",
                width: 320,
                margin: "auto",
                paddingTop: 40
            }}
            gap={16}
        >
            <Heading style={{ alignSelf: "center" }}>Create Account</Heading>

            {signupState.state === "rejected" && (
                <div style={{ color: "var(--color-error)" }}>
                    {signupState.value.message}
                </div>
            )}
            <Col gap={4}>
                Username
                <Input
                    value={login}
                    onChange={setLogin}
                    style={{ width: "100%" }}
                />
                <div style={{ color: "var(--color-secondary)" }}>
                    Can contain latin letters and numbers
                </div>
            </Col>
            <Col gap={4}>
                Password
                <Input
                    value={password}
                    onChange={setPassword}
                    style={{ width: "100%" }}
                />
            </Col>
            <Button
                style={{ alignSelf: "stretch" }}
                onClick={signup}
                isDisabled={!isValid || signupState.state === "pending"}
            >
                Create account
            </Button>
            <Button kind="transparent" as={Link} to="/">
                Log in to existing account
            </Button>
        </Col>
    )
})

export { LoginView, SignupView }
