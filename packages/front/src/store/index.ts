import { createContext, useContext } from "react"
import AuthStore from "./AuthStore"
import UserStore from "./UserStore"
import SpaceStore from "./SpaceStore"

const StoreContext = createContext<UserStore | null>(null)
const useStore = () => {
    const store = useContext(StoreContext)
    if (store === null) throw new Error("Store not provided")
    return store
}

const SpaceContext = createContext<SpaceStore | null>(null)
const useSpace = () => {
    const space = useContext(SpaceContext)
    if (space === null) throw new Error("Space not provided")
    return space
}

export {
    AuthStore,
    UserStore,
    SpaceStore,
    useStore,
    StoreContext,
    useSpace,
    SpaceContext
}
