import { makeObservable, computed, autorun, toJS, when } from "mobx"
import { fromPromise } from "mobx-utils"
import { Channel } from "@sinkron/client/lib/collection"
import { pino, Logger } from "pino"
import { sortBy } from "lodash-es"

import env from "~/env"
import { User, Space, Invite, Picture } from "~/entities"
import { Api } from "~/api"
import { FetchError } from "~/utils/fetchJson"

import { AuthStore } from "./authStore"
import { SpaceStore } from "./spaceStore"
import { DeepLinkController } from "./deepLink"

const initialRetryTimeout = 555
const maxRetryTimeout = 10000
const autoRetry = (cb: (retry: () => void) => void) => {
    let timeout = initialRetryTimeout
    let timer: ReturnType<typeof setTimeout> | undefined
    const retry = () => {
        timer = setTimeout(() => cb(retry), timeout)
        timeout = Math.min(maxRetryTimeout, timeout * 2)
    }
    cb(retry)
    const stop = () => {
        clearTimeout(timer)
    }
    return stop
}

export type UserStoreProps = {
    user: User
    spaceId?: string
    authStore: AuthStore
    deepLink?: DeepLinkController
}

class UserStore {
    authStore: AuthStore
    user: User
    spaceId?: string = undefined
    space?: SpaceStore = undefined
    channel: Channel
    api: Api
    logger: Logger<string>
    stopFetchUser?: () => void
    userIsFetched: boolean = false
    deepLink?: DeepLinkController

    constructor(props: UserStoreProps) {
        const { user, authStore, spaceId, deepLink } = props
        this.authStore = authStore
        this.api = authStore.api
        this.user = user
        this.deepLink = deepLink

        this.logger = pino({ level: "debug" })

        let initialSpaceId = user.spaces[0]?.id
        if (spaceId !== undefined && this.hasSpace(spaceId)) {
            initialSpaceId = spaceId
        }
        this.changeSpace(initialSpaceId)

        if (deepLink) this.handleDeepLink(deepLink)

        makeObservable(this, {
            user: true,
            spaceId: true,
            space: true,
            userIsFetched: true,
            spaces: computed
        })
        autorun(() => {
            const json = JSON.stringify(toJS(this.user))
            localStorage.setItem("user", json)
        })

        const token = this.api.getToken()
        this.channel = new Channel({
            logger: this.logger,
            url: `${env.apiUrl}/channel/${token}`,
            handler: (msg) => {
                if (msg === "auth_failed") {
                    this.logout()
                } else if (msg === "notification") {
                    this.user.hasUnreadNotifications = true
                } else if (msg === "profile") {
                    this.fetchUser()
                }
            }
        })
    }

    async handleDeepLink(deepLink: DeepLinkController) {
        this.deepLink = deepLink
        const spaceId = deepLink.link.spaceId
        if (this.hasSpace(spaceId)) {
            this.changeSpace(spaceId)
            this.space?.handleDeepLink(deepLink)
        } else {
            await when(() => this.userIsFetched)
            if (!this.hasSpace(spaceId)) {
                deepLink.resolve({
                    status: "failed",
                    message: "Space not found"
                })
            } else {
                if (!deepLink.isResolved) {
                    this.changeSpace(spaceId)
                    this.space?.handleDeepLink(deepLink)
                }
            }
        }
    }

    hasSpace(id: string) {
        return this.user.spaces.some((s) => s.id === id)
    }

    changeSpace(spaceId: string) {
        if (this.spaceId === spaceId) return

        this.space?.dispose()

        this.spaceId = spaceId
        const space = this.user.spaces.find((s) => s.id === this.spaceId)!
        if (space !== undefined) {
            this.space = new SpaceStore({ space, userStore: this })
            localStorage.setItem("space", space.id)
        } else {
            this.space = undefined
            localStorage.removeItem("space")
        }
    }

    dispose() {
        this.stopFetchUser?.()
        this.space?.dispose()
        this.channel.dispose()
    }

    get spaces() {
        return sortBy(this.user.spaces, (s) => s.name)
    }

    fetchUser() {
        this.stopFetchUser?.()
        this.stopFetchUser = autoRetry(async (retry) => {
            this.logger.debug("Fetching user...")
            let user
            try {
                user = await this.api.fetch<User>({
                    method: "GET",
                    url: "/profile"
                })
            } catch (e) {
                if (e instanceof FetchError && e.kind === "http") {
                    this.logger.error("Fetch user received error response")
                    this.logout()
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
        const currentSpace = user.spaces.find((s) => s.id === this.spaceId)
        if (currentSpace === undefined) {
            this.spaceId = user.spaces[0]?.id
        } else {
            this.space?.updateSpace(currentSpace)
        }
    }

    logout() {
        this.authStore.logout()
    }

    async createSpace(name: string) {
        const space: Space = await this.api.fetch({
            method: "POST",
            url: "/spaces/new",
            data: { name }
        })
        this.user.spaces.push(space)
        this.changeSpace(space.id)
    }

    changePicture(picture: Picture) {
        const res = fromPromise(
            this.api.fetch({
                method: "POST",
                url: `/account/picture`,
                data: { picture }
            })
        )
        res.then(() => {
            this.user.picture = picture
        })
        return res
    }

    async leaveSpace() {
        if (!this.spaceId) return
        await this.api.fetch({
            method: "POST",
            url: `/spaces/${this.spaceId}/leave`
        })
        const idx = this.user.spaces.findIndex((s) => s.id === this.spaceId)
        this.user.spaces.splice(idx, 1)
        this.spaceId = this.user.spaces[0]?.id
    }

    async deleteSpace() {
        if (!this.spaceId) return
        await this.api.fetch({
            method: "POST",
            url: `/spaces/${this.spaceId}/delete`
        })
        history.pushState({}, "", "/")
        const idx = this.user.spaces.findIndex((s) => s.id === this.spaceId)
        this.user.spaces.splice(idx, 1)
        this.spaceId = this.user.spaces[0]?.id
    }

    fetchNotifications() {
        this.user.hasUnreadNotifications = false
        return fromPromise(
            this.api.fetch<{ invites: Invite[] }>({
                method: "GET",
                url: "/notifications"
            })
        )
    }

    inviteAction(id: string, action: "accept" | "decline" | "cancel" | "hide") {
        return fromPromise(
            this.api.fetch<Invite>({
                method: "POST",
                url: `/invites/${id}/${action}`
            })
        )
    }

    fetchActiveSessions() {
        return fromPromise(
            this.api.fetch({
                method: "GET",
                url: "/account/sessions"
            })
        )
    }

    terminateSessions() {
        return fromPromise(
            this.api.fetch({
                method: "POST",
                url: "/account/sessions/terminate"
            })
        )
    }
}

export { UserStore }
