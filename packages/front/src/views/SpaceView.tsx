import { observer } from "mobx-react-lite"
import { useMedia } from "react-use"
import { Route, Switch, Redirect } from "wouter"

import { SpaceContext, useStore } from "../store"

import DocumentListView from "./DocumentListView"
import DocumentView from "./DocumentView"
import CategoriesView from "./CategoriesView"
import { CreateCategoryView, EditCategoryView } from "./CreateCategoryView"
import AccountAndSpaceView from "./AccountAndSpaceView"
import AccountSettingsView from "./AccountSettingsView"
import ActiveSessionsView from "./ActiveSessionsView"
import NotificationsView from "./NotificationsView"
import SpaceSettingsView from "./SpaceSettingsView"
import SpaceMembersView from "./SpaceMembersView"
import InviteMemberView from "./InviteMemberView"
import CreateSpaceView from "./CreateSpaceView"
import SwitchSpaceView from "./SwitchSpaceView"

const SpaceView = observer(() => {
    const store = useStore()
    const isMobile = useMedia("(max-width: 1023px)")

    const routes = (
        <>
            <Route
                path={`/documents/:id`}
                children={(params) => (
                    <DocumentView key={params.id} id={params.id} />
                )}
            />
            <Route path={"/account"} children={() => <AccountAndSpaceView />} />
            <Route
                path={"/account/settings"}
                children={() => <AccountSettingsView />}
            />
            <Route
                path={"/account/sessions"}
                children={() => <ActiveSessionsView />}
            />
            <Route
                path={"/notifications"}
                children={() => <NotificationsView />}
            />
            <Route
                path={"/create-space"}
                children={() => <CreateSpaceView />}
            />
            <Route
                path={"/switch-space"}
                children={() => <SwitchSpaceView />}
            />
            <Route
                path={"/space/settings"}
                children={() => <SpaceSettingsView />}
            />
            <Route
                path={"/space/members"}
                children={() => <SpaceMembersView />}
            />
            <Route
                path={"/space/invite"}
                children={() => <InviteMemberView />}
            />
            <Route path={"/categories"} children={() => <CategoriesView />} />
            <Route
                path={"/categories/new"}
                children={() => <CreateCategoryView />}
            />
            <Route
                path={"/categories/:id/edit"}
                children={(params) => <EditCategoryView id={params.id} />}
            />
            <Redirect to="/" />
        </>
    )

    if (isMobile) {
        return (
            <SpaceContext.Provider value={store.space!}>
                <Switch>
                    <Route path="/" children={() => <DocumentListView />} />
                    {routes}
                </Switch>
            </SpaceContext.Provider>
        )
    } else {
        return (
            <SpaceContext.Provider value={store.space!}>
                <div
                    style={{ display: "flex", height: "100vh", width: "100%" }}
                >
                    <div
                        style={{
                            width: 400,
                            borderRight: "2px solid var(--color-elem)",
                            height: "100%",
                            flexShrink: 0
                        }}
                    >
                        <DocumentListView />
                    </div>
                    <div style={{ flexGrow: 1, overflow: "hidden" }}>
                        <Switch>{routes}</Switch>
                    </div>
                </div>
            </SpaceContext.Provider>
        )
    }
})

export default SpaceView
