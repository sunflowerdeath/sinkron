import { observer } from "mobx-react-lite"
import { useMedia } from "react-use"
import { Route, Switch, Redirect, useLocation } from "wouter"
import { Col, Row } from "oriente"

import Container from "../ui/Container"
import { Button } from "../ui/button"
import { Avatar } from "../ui/avatar"

import { SpaceContext, useStore } from "../store"

import DocumentListView from "./DocumentListView"
import DocumentView from "./DocumentView"
import CategoriesView from "./CategoriesView"
import CreateSpaceView from "./CreateSpaceView"
import SpaceMembersView from "./SpaceMembersView"
import SwitchSpaceView from "./SwitchSpaceView"
import AccountAndSpaceView from "./AccountAndSpaceView"
import { CreateCategoryView, EditCategoryView } from "./CreateCategoryView"

import { Input } from "../ui/input"

const InviteMemberView = observer(() => {
    const [location, navigate] = useLocation()
    // const store = useStore()
    return (
        <Container title="Invite member" onClose={() => navigate("/")}>
            <Col gap={8} style={{ alignSelf: "stretch" }}>
                Username
                <Input style={{ width: 400 }} autoFocus />
            </Col>

            <Col gap={8} style={{ alignSelf: "stretch" }}>
                Role
                <Input style={{ width: 400 }} />
            </Col>

            <Button>Send invite</Button>
        </Container>
    )
})

const AccountSettingsView = observer(() => {
    const [location, navigate] = useLocation()
    const store = useStore()
    return (
        <Container title="Account settings" onClose={() => navigate("/")}>
            <Row gap={8} align="center">
                <Avatar name={store.user!.name} />
                <div>{store.user!.name}</div>
            </Row>
            <Button>Change image</Button>
            <Button>Change password</Button>
        </Container>
    )
})

const NotificationsView = observer(() => {
    const [location, navigate] = useLocation()
    const store = useStore()
    // No notifications
    return (
        <Container title="Notifications" onClose={() => navigate("/")}>
            <Col gap={32}>
                <Col gap={8}>
                    <div style={{ color: "#999" }}>Today, 18:57</div>
                    User @sunflowerdeath invites you to join space "Food" with a
                    role "Admin".
                    <Row gap={8}>
                        <Button>Decline</Button>
                        <Button>Accept</Button>
                    </Row>
                </Col>
                <Col gap={8}>
                    <div style={{ color: "#999" }}>Today, 18:57</div>
                    You invited user @sunflowerdeath to space "Food" with a role
                    "Admin"
                    <Row gap={8}>
                        <Button>Cancel invite</Button>
                        <Button>Edit invite</Button>
                    </Row>
                </Col>
                <Col gap={8}>
                    <div style={{ color: "#999" }}>Today, 18:57</div>
                    User @sunflowerdeath accepted your invite to join space
                    "Food".
                    <Button>Hide</Button>
                </Col>
            </Col>
        </Container>
    )
})

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
                <div style={{ display: "flex", height: "100vh" }}>
                    <div
                        style={{
                            width: 400,
                            borderRight: "2px solid #555",
                            height: "100%"
                        }}
                    >
                        <DocumentListView />
                    </div>
                    <div style={{ flexGrow: 1 }}>
                        <Switch>{routes}</Switch>
                    </div>
                </div>
            </SpaceContext.Provider>
        )
    }
})

export default SpaceView
