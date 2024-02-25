import { useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { useTitle, useMedia } from 'react-use'
import { observer } from 'mobx-react-lite'
import { Router } from 'wouter'
import { OrienteProvider, Col } from 'oriente'

import { ConnectionStatus } from '../sinkron/client'
import { AuthStore, Store, useStore, StoreContext } from './store'

import SpaceView from './views/SpaceView'

import { Button } from './ui/button'

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

interface LoginViewProps {
    store: AuthStore
}

const LoginView = (props: LoginViewProps) => {
    return (
        <Col align="center" justify="center" style={{ height: '100%' }}>
            <Button
                onClick={() => {
                    props.store.authenticate({
                        name: 'test',
                        password: 'password'
                    })
                }}
            >
                Login
            </Button>
        </Col>
    )
}

const Root = observer(() => {
    const authStore = useMemo(() => {
        const s = new AuthStore()
        window.store = s
        return s
    }, [])

    useTitle('Box')

    if (!authStore.isInited) return null

    return (
        <OrienteProvider>
            <Router>
                {authStore.user ? (
                    <StoreContext.Provider value={authStore.store!}>
                        <SpaceView />
                    </StoreContext.Provider>
                ) : (
                    <LoginView store={authStore} />
                )}
            </Router>
        </OrienteProvider>
    )
})

const root = createRoot(document.getElementById('root')!)
root.render(<Root />)
