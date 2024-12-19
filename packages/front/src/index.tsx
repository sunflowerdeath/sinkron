import "./main.css"
import "core-js/stable"

import { useMemo } from "react"
import { createRoot } from "react-dom/client"
import { useTitle } from "react-use"
import { observer } from "mobx-react-lite"
import { Router, Switch, Route, Redirect, useLocation } from "wouter"
import { OrienteProvider } from "oriente"
import { configure } from "mobx"

import { parseDeepLink } from "./store/deepLink"
import { AuthStore, StoreContext } from "./store"
import { SpaceView } from "./views/spaceView"
import { LoginView } from "./views/loginView"
import { CreateSpaceView } from "./views/createSpaceView"
import { DeepLinkView } from "./views/deepLinkView"

// Disable mobx strict mode
configure({ enforceActions: "never" })

type AppViewProps = {
    store: AuthStore
}

const AppView = observer((props: AppViewProps) => {
    const { store } = props
    return (
        <>
            {store.store!.space ? (
                <SpaceView />
            ) : (
                <CreateSpaceView container={false} />
            )}
            {store.deepLink && <DeepLinkView deepLink={store.deepLink} />}
        </>
    )
})

const Root = observer(() => {
    const [location, navigate] = useLocation()

    const authStore = useMemo(() => {
        const deepLink = parseDeepLink(location)
        if (deepLink) {
            // @ts-expect-error replace option
            navigate("/", { replace: "true" })
        }

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
