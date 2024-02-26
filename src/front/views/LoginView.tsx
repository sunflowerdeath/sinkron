import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { fromPromise, IPromiseBasedObservable } from 'mobx-utils'
import { Col } from 'oriente'
import { Link } from 'wouter'

import { AuthStore } from '../store'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Heading } from '../ui/heading'

interface LoginViewProps {
    store: AuthStore
}

const LoginView = observer((props: LoginViewProps) => {
    const [login, setLogin] = useState('')
    const [password, setPassword] = useState('')

    const isValid = login.length > 0 && password.length > 0

    const [authState, setAuthState] = useState<IPromiseBasedObservable<any>>(
        fromPromise.resolve()
    )
    const auth = () => {
        const state = props.store.authenticate({ name: login, password })
        setAuthState(fromPromise(state))
    }

    return (
        <Col
            align="normal"
            justify="center"
            style={{
                height: '100%',
                width: 320,
                margin: 'auto',
                paddingTop: 40
            }}
            gap={32}
        >
            <Heading style={{ alignSelf: "center" }}>Sign In</Heading>
            <Col gap={4}>
                Login
                <Input
                    value={login}
                    onChange={setLogin}
                    style={{ width: '100%' }}
                />
            </Col>
            <Col gap={4}>
                Password
                <Input
                    value={password}
                    onChange={setPassword}
                    style={{ width: '100%' }}
                />
            </Col>
            <Button
                style={{ alignSelf: 'stretch' }}
                onClick={auth}
                isDisabled={!isValid || authState.state === 'pending'}
            >
                Login
            </Button>
            <Button kind="transparent" as={Link} to="/signup">
                Create Account
            </Button>
        </Col>
    )
})

const SignupView = observer((props: LoginViewProps) => {
    const [login, setLogin] = useState('')
    const [password, setPassword] = useState('')

    const isValid = login.length > 0 && password.length > 0

    const [authState, setAuthState] = useState<IPromiseBasedObservable<any>>(
        fromPromise.resolve()
    )
    const signup = () => {
        const state = props.store.authenticate({ name: login, password })
        setAuthState(fromPromise(state))
    }

    return (
        <Col
            align="normal"
            justify="center"
            style={{
                height: '100%',
                width: 320,
                margin: 'auto',
                paddingTop: 40
            }}
            gap={32}
        >
            <Heading style={{ alignSelf: "center" }}>Create Account</Heading>
            <Col gap={4}>
                Login
                <Input
                    value={login}
                    onChange={setLogin}
                    style={{ width: '100%' }}
                />
            </Col>
            <Col gap={4}>
                Password
                <Input
                    value={password}
                    onChange={setPassword}
                    style={{ width: '100%' }}
                />
            </Col>
            <Button
                style={{ alignSelf: 'stretch' }}
                onClick={signup}
                isDisabled={!isValid || authState.state === 'pending'}
            >
                Create account
            </Button>
            <Button kind="transparent" as={Link} to="/">
                Sign In
            </Button>
        </Col>
    )
})

export { LoginView, SignupView }
