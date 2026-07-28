import { observer } from "mobx-react-lite"
import { OrienteProvider } from "oriente"
import React from "react"
import { useMemo } from "react"
import { useState } from "react"
import { createRoot } from "react-dom/client"
import { useTitle } from "react-use"
import { Router, Switch, Route, Redirect, useLocation } from "wouter"

import { Col, Input, Button } from "./ui"

export type User = {
    id: string
    email: string
}

class Store {
    api: Api

    authToken?: string = undefined
    user?: User

    constructor() {
        this.api = new Api({
            baseUrl: env.urls.api,
            getToken: () => this.token
        })
    }

    async login(email: string) {
        return await this.api.fetch<{ id: string }>({
            method: "POST",
            url: "/login",
            data: { email }
        })
    }

    async code(id: string, code: string) {
        const { user, token } = await this.api.fetch<AuthResponse>({
            method: "POST",
            url: "/code",
            data: { id, code }
        })
        localStorage.setItem("token", token)
        localStorage.setItem("user", JSON.stringify(user))
        this.token = token
        this.user = user
        console.log(`Logged in as "${user.email}"`)
    }
}


const PhotonView = observer(() => {
    return <div>Photon</div>
})

const Root = observer(() => {
    const [location, navigate] = useLocation()

    useTitle("Photon")

    const store = useMemo(() => {
        const store = new Store()
        // @ts-expect-error expose store globally for debugging
        window.store = store
        return store
    }, [])

    return (
        <OrienteProvider>
            <Router>
                {store.user ? (
                    <PhotonView />
                ) : (
                    <Switch>
                        <Route path="/" children={() => <LoginView />} />
                        <Redirect to="/" />
                    </Switch>
                )}
            </Router>
        </OrienteProvider>
    )
})

const root = createRoot(document.getElementById("root")!)
root.render(<Root />)
