import "./main.css"
import "core-js/stable"

import { useState, useEffect } from "react"
import { parse } from "regexparam"
import { useMemo } from "react"
import { createRoot } from "react-dom/client"
import { useTitle } from "react-use"
import { observer } from "mobx-react-lite"
import { Router, Switch, Route, Redirect, useLocation } from "wouter"
import { OrienteProvider } from "oriente"
import { configure } from "mobx"

import { DeepLink } from "./store/AuthStore"

import { Dialog, Button, Heading } from "./ui"
import { AuthStore, StoreContext } from "./store"
import SpaceView from "./views/SpaceView"
import { LoginView } from "./views/LoginView"
import CreateSpaceView from "./views/CreateSpaceView"

import { Col } from "oriente"

// Disable mobx strict mode
configure({ enforceActions: "never" })

type AppViewProps = {
    store: AuthStore
}

type MatchPathProps = {
    pattern: string
    path: string
}

const matchPath = (props: MatchPathProps) => {
    const { pattern, path } = props
    const parsed = parse(pattern)

    const matches = parsed.pattern.exec(path)
    if (matches === null) return undefined

    const res: { [key: string]: string } = {}
    parsed.keys.forEach((key, idx) => {
        res[key] = matches[idx + 1]
    })
    return res
}

const useDelay = (delay: number) => {
    const [isOver, setIsOver] = useState(false)
    useEffect(() => {
        const timeout = setTimeout(() => setIsOver(true), delay)
        return () => clearTimeout(timeout)
    }, [])
    return isOver
}

const AppView = observer((props: AppViewProps) => {
    const { store } = props

    const delay = useDelay(222)
    const deepLinkDialog = (
        <Dialog
            onClose={() => {
                store.deepLink?.resolve(false)
            }}
            isOpen={delay && store.deepLink && !store.deepLink.isResolved}
        >
            {(close) => (
                <Col gap={16}>
                    <Heading>Opening link</Heading>
                    Loading...
                    <Button style={{ alignSelf: "stretch" }} onClick={close}>
                        Cancel
                    </Button>
                </Col>
            )}
        </Dialog>
    )

    return (
        <>
            {store.store!.space ? (
                <SpaceView />
            ) : (
                <CreateSpaceView container={false} />
            )}
            {deepLinkDialog}
        </>
    )
})

const Root = observer(() => {
    const [location, navigate] = useLocation()

    const authStore = useMemo(() => {
        const match = matchPath({
            pattern: "/link/:spaceId/:docId",
            path: location // window.location.pathname
        })
        const deepLink = match === undefined ? undefined : (match as DeepLink)
        if (deepLink) navigate("/", { replace: "true" })

        const s = new AuthStore({ deepLink })

        // @ts-expect-error expose store globally
        window.store = s

        return s
    }, [])

    useTitle("Sinkron")

    return (
        <OrienteProvider>
            <Router>
                {authStore.store ? (
                    <StoreContext.Provider value={authStore.store}>
                        <AppView store={authStore} />
                    </StoreContext.Provider>
                ) : (
                    <Switch>
                        <Route
                            path="/"
                            children={() => <LoginView store={authStore} />}
                        />
                        <Redirect to="/" />
                    </Switch>
                )}
            </Router>
        </OrienteProvider>
    )
})

const root = createRoot(document.getElementById("root")!)
root.render(<Root />)
