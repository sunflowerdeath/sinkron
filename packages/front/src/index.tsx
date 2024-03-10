import { useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { useTitle } from 'react-use'
import { observer } from 'mobx-react-lite'
import { Router, Switch, Route, Redirect } from 'wouter'
import { OrienteProvider } from 'oriente'

// import type { ConnectionStatus } from 'sinkron-client'
import { AuthStore, StoreContext } from './store'

import SpaceView from './views/SpaceView'
import { LoginView, SignupView } from './views/LoginView'

/*
const statusMap = {
    [ConnectionStatus.Disconnected]: 'Waiting for connection...',
    [ConnectionStatus.Connected]: 'Connecting...',
    [ConnectionStatus.Sync]: 'Receiving changes...',
    [ConnectionStatus.Ready]: 'Connected'
}

const status = (
    <div style={{ padding: '0 8px', paddingBottom: 8, color: '#999' }}>
        {statusMap[space.collection.status]}
    </div>
)
*/

const Root = observer(() => {
    const authStore = useMemo(() => {
        const s = new AuthStore()
        window.store = s
        return s
    }, [])

    useTitle('Box')

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
