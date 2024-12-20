import { createContext, useContext } from "react"

import { AuthStore } from "./authStore"
import { UserStore } from "./userStore"
import { SpaceStore } from "./spaceStore"

const UserStoreContext = createContext<UserStore | null>(null)
const useUserStore = () => {
    const store = useContext(UserStoreContext)
    if (store === null) throw new Error("Store not provided")
    return store
}

const SpaceContext = createContext<SpaceStore | null>(null)
const useSpaceStore = () => {
    const space = useContext(SpaceContext)
    if (space === null) throw new Error("Space not provided")
    return space
}

export {
    AuthStore,
    UserStore,
    SpaceStore,
    useUserStore,
    UserStoreContext,
    useSpaceStore,
    SpaceContext
}
