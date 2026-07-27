import { observer } from "mobx-react-lite"
import { OrienteProvider } from "oriente"
import React from "react"
import { useMemo } from "react"
import { createRoot } from "react-dom/client"
import { useTitle } from "react-use"
import { Router, Switch, Route, Redirect, useLocation } from "wouter"

export type User = {
    id: string
    email: string
}

class Store {
    user?: User
}

const LoginView = observer(() => {
    return (
        <div>
            Photon
            <div>
                Enter your email adress:
                <input />
                <button>Continue</button>
            </div>
        </div>
    )
})

const PhotonView = observer(() => {
    return <div>Photon</div>
})

const Root = observer(() => {
    const [location, navigate] = useLocation()

    useTitle("Photon")

    const store = useMemo(() => {
        const store = new Store()
        // @ts-expect-error expose store globally for debugging
        window.store = store
        return store
    }, [])

    return (
        <OrienteProvider>
            <Router>
                {store.user ? (
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
