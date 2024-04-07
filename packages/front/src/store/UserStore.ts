import { makeAutoObservable, reaction } from "mobx"
import { fromPromise } from "mobx-utils"
import { ChannelClient } from "sinkron-client"

import env from "../env"
import { User, Space } from "../entities"
import { Api } from "../api"

import AuthStore from "./AuthStore"
import SpaceStore from "./SpaceStore"

interface StoreProps {
    user: User
    spaceId?: string
    authStore: AuthStore
}

class UserStore {
    authStore: AuthStore
    user: User
    spaceId?: string = undefined
    space?: SpaceStore = undefined
    channel: ChannelClient
    api: Api

    constructor(props: StoreProps) {
        const { user, authStore, spaceId } = props
        this.authStore = authStore
        this.api = authStore.api
        this.user = user

        if (
            spaceId !== undefined &&
            user.spaces.some((s) => s.id === spaceId)
        ) {
            this.spaceId = spaceId
        } else {
            this.spaceId = user.spaces[0]?.id
        }

        makeAutoObservable(this)

        reaction(
            () => this.spaceId,
            () => {
                this.space?.dispose()
                const space = this.user.spaces.find(
                    (s) => s.id === this.spaceId
                )!
                this.space = new SpaceStore(space, this)
                localStorage.setItem("space", space.id)
            },
            { fireImmediately: true }
        )

        const token = user.token
        this.channel = new ChannelClient({
            url: `${env.wsUrl}/channels/${token}`,
            channel: `users/${user.id}`,
            handler: (msg) => {
                if (msg === "notification") {
                    this.user.hasUnreadNotifications = true
                }
            }
        })
    }

    dispose() {
        this.space?.dispose()
        this.channel.dispose()
    }

    async fetchUser() {
        console.log("Fetching user...")
        let user
        try {
            user = await this.api.fetch<User>({
                method: "GET",
                url: "/profile"
            })
        } catch (e) {
            // if (e.kind === "http") {
            // TODO if session expired / terminated
            console.log("Fetch user error")
            this.logout()
            // }
            return
        }
        this.updateUser(user)
        console.log("Fetch user success")
    }

    updateUser(user: User) {
        this.user = user
        if (!user.spaces.find((s) => s.id === this.spaceId)) {
            this.spaceId = user.spaces[0].id
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

    changeSpace(spaceId: string) {
        if (this.spaceId !== spaceId) {
            this.spaceId = spaceId
        }
    }

    async leaveSpace() {
        if (!this.spaceId) return
        await this.api.fetch({
            method: "POST",
            url: "/spaces/${this.spaceId}/leave"
        })
        const idx = this.user.spaces.findIndex((s) => s.id === this.spaceId)
        this.user.spaces.splice(idx, 1)
        this.spaceId = this.user.spaces[0].id
    }

    fetchNotifications() {
        this.user.hasUnreadNotifications = false
        return fromPromise(
            this.api.fetch({ method: "GET", url: "/notifications" })
        )
    }

    inviteAction(id: string, action: "accept" | "decline" | "cancel" | "hide") {
        return fromPromise(
            this.api.fetch({
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

export default UserStore
