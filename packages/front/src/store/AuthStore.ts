import { makeAutoObservable } from "mobx"
import { IndexedDbCollectionStore } from "sinkron-client"

import env from "../env"
import { User } from "../entities"
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

        if (this.token !== undefined) {
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
        this.store = new UserStore({ authStore: this, user })
        console.log(`Logged in as "${user.email}"`)
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
