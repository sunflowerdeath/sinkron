import { observer } from 'mobx-react-lite'
import { useMedia } from 'react-use'
import { Route, Switch, Redirect } from 'wouter'
import { Col, Row } from 'oriente'

import { Store, useStore, DocumentListItemData } from '../store'

import DocumentListView from './DocumentListView'
import DocumentView from './DocumentView'
import CategoriesView from './CategoriesView'
import CreateSpaceView from './CreateSpaceView'
import SpaceMembersView from './SpaceMembersView'
import SwitchSpaceView from './SwitchSpaceView'
import AccountAndSpaceView from './AccountAndSpaceView'
import { CreateCategoryView, EditCategoryView } from './CreateCategoryView'

const SettingsView = observer(() => {
    return <div></div>
})

const NotificationsView = observer(() => {
    const store = useStore()
    return <div title="Notifications">No notifications</div>
})

const SpaceView = observer(() => {
    const isMobile = useMedia('(max-width: 1023px)')

    const routes = (
        <>
            <Route
                path={`/documents/:id`}
                children={(params) => (
                    <DocumentView key={params.id} id={params.id} />
                )}
            />
            <Route
                path={'/account'}
                children={(params) => <AccountAndSpaceView />}
            />
            <Route
                path={'/notifications'}
                children={(params) => <NotificationsView />}
            />
            <Route
                path={'/create-space'}
                children={(params) => <CreateSpaceView />}
            />
            <Route
                path={'/switch-space'}
                children={(params) => <SwitchSpaceView />}
            />
            <Route
                path={'/space/members'}
                children={(params) => <SpaceMembersView />}
            />
            <Route
                path={'/categories'}
                children={(params) => <CategoriesView />}
            />
            <Route
                path={'/categories/new'}
                children={(params) => <CreateCategoryView />}
            />
            <Route
                path={'/categories/:id/edit'}
                children={(params) => <EditCategoryView id={params.id} />}
            />
            <Redirect to="/" />
        </>
    )

    if (isMobile) {
        return (
            <Switch>
                <Route path="/" children={() => <DocumentListView />} />
                {routes}
            </Switch>
        )
    } else {
        return (
            <div style={{ display: 'flex', height: '100vh' }}>
                <div
                    style={{
                        width: 400,
                        borderRight: '2px solid #555',
                        height: '100%'
                    }}
                >
                    <DocumentListView />
                </div>
                <div style={{ flexGrow: 1 }}>
                    <Switch>{routes}</Switch>
                </div>
            </div>
        )
    }
})

export default SpaceView
