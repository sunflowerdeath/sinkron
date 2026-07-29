import { Api } from "./api"

type InitStoreProps = {
}

// Local storage key names 
const AUTH_TOKEN_KEY = "photon_auth_token"
const USER_KEY = "photon_user"

// Store that handles app initialization, and user login and logout procedure
class InitStore {
    authToken?: string
    photon?: PhotonStore
    api: Api

    constructor(props: InitStoreProps) {
        this.authToken = localStorage.getItem(AUTH_TOKEN_KEY) || undefined

        this.api = new Api({
            baseUrl: env.urls.api,
            getToken: () => this.authToken
        })

        if (this.authToken !== undefined) {
            const user = localStorage.getItem(USER_KEY)
            if (user !== null) {
                this.photon = new PhotonStore({
                    initStore: this,
                    user: JSON.parse(user),
                    // deepLink: this.deepLink
                })
                this.photon.fetchUser()
            }
        }
    }

    async login(email: string) {
        return await this.api.fetch<{ id: string }>({
            method: "POST",
            url: "/login",
            data: { email }
        })
    }

    async sendCode(id: string, code: string) {
        const { user, token } = await this.api.fetch<AuthResponse>({
            method: "POST",
            url: "/code",
            data: { id, code }
        })
        localStorage.setItem("token", token)
        localStorage.setItem("user", JSON.stringify(user))
        this.authToken = token
        this.photon = new PhotonStore({
            initStore: this,
            user,
            // deepLink: this.deepLink
        })
        console.log(`Logged in as "${user.email}"`)
    }

    logout() {
        console.log("Logout")
        localStorage.removeItem("token")
        localStorage.removeItem("user")
        localStorage.removeItem("space")
        this.deepLink = undefined
        this.authToken = undefined
        this.photon?.dispose()
        this.photon = undefined
        history.pushState({}, "", "/")
        IndexedDbCollectionStore.clearAll()
    }
}

type PhotonStoreProps = {
    initStore: InitStore,
    user: User
}

// Store that handles main application state
class PhotonStore {
    initStore: InitStore
    user: User

    constructor(props: PhotonStoreProps) {
        const { user, initStore } = props
        this.initStore = initStore
        this.user = user
    }

    dispose() {
    }
}

export { InitStore, PhotonStore }
