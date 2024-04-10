import { makeAutoObservable } from "mobx"
import { IndexedDbCollectionStore } from "sinkron-client"

import env from "../env"
import { Credentials, User } from "../entities"
import { Api } from "../api"

import UserStore from "./UserStore"

type AuthResponse = { user: User; token: string }

class AuthStore {
    store?: UserStore = undefined
    token?: string = undefined
    api: Api

    constructor() {
        this.token = localStorage.getItem("token") || undefined

        this.api = new Api({
            baseUrl: env.apiUrl,
            getToken: () => this.token
        })

        if (this.token !== null) {
            const user = localStorage.getItem("user")
            if (user !== null) {
                const spaceId = localStorage.getItem("space")
                this.store = new UserStore({
                    authStore: this,
                    user: JSON.parse(user),
                    spaceId: spaceId || undefined
                })
                this.store.fetchUser()
            }
        }

        makeAutoObservable(this)
    }

    async login(credentials: Credentials) {
        const { user, token } = await this.api.fetch<AuthResponse>({
            method: "POST",
            url: "/login",
            data: credentials
        })
        localStorage.setItem("token", token)
        localStorage.setItem("user", JSON.stringify(user))
        this.token = token
        this.store = new UserStore({ authStore: this, user })
        console.log(`Logged in as "${user.name}"`)
    }

    async signup(credentials: Credentials) {
        const { user, token } = await this.api.fetch<AuthResponse>({
            method: "POST",
            url: "/signup",
            data: credentials
        })
        localStorage.setItem("token", token)
        localStorage.setItem("user", JSON.stringify(user))
        this.token = token
        this.store = new UserStore({ authStore: this, user })
        console.log(`Signed up as ${user.name}`)
    }

    logout() {
        console.log("Logout")
        localStorage.removeItem("token")
        localStorage.removeItem("user")
        localStorage.removeItem("space")
        this.token = undefined
        this.store?.dispose()
        this.store = undefined
        history.pushState({}, "", "/")
        IndexedDbCollectionStore.clearAll()
    }
}

export default AuthStore
