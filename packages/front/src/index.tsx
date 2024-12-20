import "./main.css"
import "core-js/stable"

import { useMemo } from "react"
import { createRoot } from "react-dom/client"
import { useTitle } from "react-use"
import { observer } from "mobx-react-lite"
import { Router, Switch, Route, Redirect, useLocation } from "wouter"
import { OrienteProvider } from "oriente"
import { configure } from "mobx"

import { parseDeepLinkPath } from "./store/deepLink"
import { AuthStore, UserStoreContext } from "./store"
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
            {store.deepLink && (
                <DeepLinkView
                    key={store.deepLink.key}
                    deepLink={store.deepLink}
                />
            )}
        </>
    )
})

const Root = observer(() => {
    const [location, navigate] = useLocation()

    const authStore = useMemo(() => {
        const deepLink = parseDeepLinkPath(location)
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
                    <UserStoreContext.Provider value={authStore.store}>
                        <AppView store={authStore} />
                    </UserStoreContext.Provider>
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
