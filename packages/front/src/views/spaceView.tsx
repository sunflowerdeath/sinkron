import { observer } from "mobx-react-lite"
import { useMedia } from "react-use"
import { Route, Switch, Redirect } from "wouter"
import { useFavicon } from "react-use"
import { ConnectionStatus } from "@sinkron/client/lib/collection"

import defaultFaviconUrl from "~/favicon.ico"
import offFaviconUrl from "~/favicon_off.ico"

import { SpaceContext, useStore } from "~/store"

import { DocumentListView } from "./documentListView"
import { DocumentView } from "./documentView"
import { CategoriesView } from "./categoriesView"
import { CreateCategoryView, EditCategoryView } from "./createCategoryView"
import { AccountAndSpaceView } from "./accountAndSpaceView"
import { AccountSettingsView } from "./accountSettingsView"
import {
    ChangeUserPictureView,
    ChangeSpacePictureView
} from "./changePictureView"
import { ActiveSessionsView } from "./activeSessionsView"
import { NotificationsView } from "./notificationsView"
import { SpaceSettingsView } from "./spaceSettingsView"
import { SpaceMembersView } from "./spaceMembersView"
import { InviteMemberView } from "./inviteMemberView"
import { CreateSpaceView } from "./createSpaceView"
import { SwitchSpaceView } from "./switchSpaceView"

const SpaceView = observer(() => {
    const store = useStore()
    const spaceStore = store.space!
    const isMobile = useMedia("(max-width: 1023px)")

    useFavicon(
        spaceStore.collection.status === ConnectionStatus.Disconnected
            ? offFaviconUrl
            : defaultFaviconUrl
    )

    const routes = [
        <Route
            path={`/documents/:id`}
            children={(params) => (
                <DocumentView key={params.id} id={params.id} />
            )}
        />,
        <Route path={"/account"} children={() => <AccountAndSpaceView />} />,
        <Route
            path={"/account/settings"}
            children={() => <AccountSettingsView />}
        />,
        <Route
            path={"/account/picture"}
            children={() => <ChangeUserPictureView />}
        />,
        <Route
            path={"/account/sessions"}
            children={() => <ActiveSessionsView />}
        />,
        <Route
            path={"/notifications"}
            children={() => <NotificationsView />}
        />,
        <Route
            path={"/create-space"}
            children={() => <CreateSpaceView container={true} />}
        />,
        <Route path={"/switch-space"} children={() => <SwitchSpaceView />} />,
        <Route
            path={"/space/settings"}
            children={() => <SpaceSettingsView />}
        />,
        <Route
            path={"/space/picture"}
            children={() => <ChangeSpacePictureView />}
        />,
        <Route path={"/space/members"} children={() => <SpaceMembersView />} />,
        <Route path={"/space/invite"} children={() => <InviteMemberView />} />,
        <Route path={"/categories"} children={() => <CategoriesView />} />,
        <Route
            path={"/categories/new"}
            children={() => <CreateCategoryView />}
        />,
        <Route
            path={"/categories/:id/edit"}
            children={(params) => <EditCategoryView id={params.id} />}
        />,
        <Redirect to="/" />
    ]

    if (isMobile) {
        return (
            spaceStore.collection.isLoaded && (
                <SpaceContext.Provider value={spaceStore}>
                    <Switch>
                        <Route path="/" children={() => <DocumentListView />} />
                        {...routes}
                    </Switch>
                </SpaceContext.Provider>
            )
        )
    } else {
        return (
            <SpaceContext.Provider value={spaceStore}>
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
                        {spaceStore.collection.isLoaded && (
                            <Switch>{...routes}</Switch>
                        )}
                    </div>
                </div>
            </SpaceContext.Provider>
        )
    }
})

export { SpaceView }
