import { makeObservable, action, computed } from "mobx"
import { IndexedDbCollectionStore } from "@sinkron/client/lib/collection"

import env from "~/env"
import { User } from "~/entities"
import { Api } from "~/api"

import UserStore from "./UserStore"

type AuthResponse = { user: User; token: string }

export type DocumentDeepLink = {
    kind: "document"
    spaceId: string
    docId: string
}

export type DeepLink = DocumentDeepLink

export type DeepLinkState = "pending" | "error" | "ok"

export class DeepLinkStore {
    link: DeepLink
    state?: DeepLinkState = "pending"

    constructor(link: DeepLink) {
        this.link = link
        makeObservable(this, {
            state: true,
            isResolved: computed
        })
    }

    get isResolved() {
        return this.state !== "pending"
    }

    resolve(ok: boolean) {
        if (!this.isResolved) {
            this.state = ok ? "ok" : "error"
        }
    }

    dispose() {
        // TODO
    }
}

type AuthStoreProps = {
    deepLink?: DeepLink
}

class AuthStore {
    store?: UserStore = undefined
    token?: string = undefined
    api: Api
    deepLink?: DeepLinkStore

    constructor(props: AuthStoreProps) {
        const { deepLink } = props

        this.token = localStorage.getItem("token") || undefined

        this.api = new Api({
            baseUrl: env.apiUrl,
            getToken: () => this.token
        })

        if (deepLink) {
            this.deepLink = new DeepLinkStore(deepLink)
        }

        if (this.token !== undefined) {
            const user = localStorage.getItem("user")
            if (user !== null) {
                const spaceId = localStorage.getItem("space")
                this.store = new UserStore({
                    authStore: this,
                    user: JSON.parse(user),
                    spaceId: spaceId || undefined,
                    deepLink: this.deepLink
                })
                this.store.fetchUser()
            }
        }

        makeObservable(this, {
            store: true,
            login: action,
            code: action,
            logout: action
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
