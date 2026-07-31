import { Api } from "./api"
import { User, Otp } from "./entities"
import { env } from "./env"

type AuthResponse = {
    user: User
    token: string
}

type InitStoreProps = {}

// Local storage key names
const AUTH_TOKEN_KEY = "photon_auth_token"
const USER_DATA_KEY = "photon_user_data"

// Store that handles app initialization, and user login and logout procedure
class InitStore {
    authToken?: string
    photon?: PhotonStore
    api: Api

    constructor(props: InitStoreProps) {
        this.authToken = localStorage.getItem(AUTH_TOKEN_KEY) || undefined

        this.api = new Api({
            baseUrl: env.urls.api,
            getToken: () => this.authToken,
        })

        if (this.authToken !== undefined) {
            const user = localStorage.getItem(USER_DATA_KEY)
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
        return await this.api.fetch<Otp>({
            method: "POST",
            url: "/login",
            data: { email },
        })
    }

    async sendCode(id: string, code: string) {
        const { user, token } = await this.api.fetch<AuthResponse>({
            method: "POST",
            url: "/code",
            data: { id, code },
        })
        localStorage.setItem(AUTH_TOKEN_KEY, token)
        localStorage.setItem(USER_DATA_KEY, JSON.stringify(user))
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
        localStorage.removeItem(AUTH_TOKEN_KEY)
        localStorage.removeItem(USER_DATA_KEY)
        this.authToken = undefined
        this.photon?.dispose()
        this.photon = undefined
        history.pushState({}, "", "/")
    }
}

type PhotonStoreProps = {
    initStore: InitStore
    user: User
}

// Store that handles main application state
class PhotonStore {
    initStore: InitStore
    user: User
    api: Api

    userIsFetched = false

    constructor(props: PhotonStoreProps) {
        const { user, initStore } = props
        this.initStore = initStore
        this.api = initStore.api
        this.user = user
    }

    async fetchUser() {
        this.stopFetchUser?.()
        this.stopFetchUser = autoRetry(async (retry) => {
            this.logger.debug("Fetching user...")
            let user: User
            try {
                user = await this.api.fetch<User>({
                    method: "GET",
                    url: "/profile"
                })
            } catch (e) {
                if (e instanceof FetchError && e.kind === "http") {
                    // TODO if auth error - logout
                    // this.logout()
                    // else - keep trying
                    this.logger.error("Fetch user received error response")
                } else {
                    this.logger.error("Couldn't fetch user, will retry")
                    retry()
                }
                return
            }
            this.updateUser(user)
            this.userIsFetched = true
            this.logger.info("Fetch user success")
        })
    }

    updateUser(user: User) {
        this.user = user
    }

    dispose() {}
}

export { InitStore, PhotonStore }
