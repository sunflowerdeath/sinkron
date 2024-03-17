import { useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { useTitle } from 'react-use'
import { observer } from 'mobx-react-lite'
import { Router, Switch, Route, Redirect } from 'wouter'
import { OrienteProvider } from 'oriente'

import { AuthStore, StoreContext } from './store'

import SpaceView from './views/SpaceView'
import { LoginView, SignupView } from './views/LoginView'

const Root = observer(() => {
    const authStore = useMemo(() => {
        const s = new AuthStore()
        window.store = s
        return s
    }, [])

    useTitle('Sinkron')

    return (
        <OrienteProvider>
            <Router>
                {authStore.store ? (
                    <StoreContext.Provider value={authStore.store}>
                        <SpaceView />
                    </StoreContext.Provider>
                ) : (
                    <Switch>
                        <Route
                            path="/"
                            children={() => <LoginView store={authStore} />}
                        />
                        <Route
                            path="/signup"
                            children={() => <SignupView store={authStore} />}
                        />
                        <Redirect to="/" />
                    </Switch>
                )}
            </Router>
        </OrienteProvider>
    )
})

const root = createRoot(document.getElementById('root')!)
root.render(<Root />)
