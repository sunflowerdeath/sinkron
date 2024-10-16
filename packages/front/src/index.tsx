import { useMemo } from "react"
import { createRoot } from "react-dom/client"
import { useTitle } from "react-use"
import { observer } from "mobx-react-lite"
import { Router, Switch, Route, Redirect } from "wouter"
import { OrienteProvider } from "oriente"
import { configure } from "mobx"

import { AuthStore, StoreContext } from "./store"
import SpaceView from "./views/SpaceView"
import { LoginView } from "./views/LoginView"
import CreateSpaceView from "./views/CreateSpaceView"

// Disable mobx strict mode
configure({ enforceActions: "never" })

const Root = observer(() => {
    const authStore = useMemo(() => {
        const s = new AuthStore()
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
                        {authStore.store.space ? (
                            <SpaceView />
                        ) : (
                            <CreateSpaceView container={false} />
                        )}
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
