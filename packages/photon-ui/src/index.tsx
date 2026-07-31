import { observer } from "mobx-react-lite"
import { OrienteProvider } from "oriente"
import React from "react"
import { useMemo } from "react"
import { createRoot } from "react-dom/client"
import { useTitle } from "react-use"
import { Router, Switch, Route, Redirect, useLocation } from "wouter"

import { InitStore } from "./store"
import { LoginView } from "./views/loginView"

const PhotonView = observer(() => {
    return <div>Photon</div>
})

const Root = observer(() => {
    const [location, navigate] = useLocation()

    useTitle("Photon")

    const store = useMemo(() => {
        const store = new InitStore({})
        // @ts-expect-error expose store globally for debugging
        window.store = store
        return store
    }, [])

    return (
        <OrienteProvider>
            <Router>
                {store.photon ? (
                    <PhotonView />
                ) : (
                    <Switch>
                        <Route path="/" children={() => <LoginView />} />
                        <Redirect to="/" />
                    </Switch>
                )}
            </Router>
        </OrienteProvider>
    )
})

const root = createRoot(document.getElementById("root")!)
root.render(<Root />)
