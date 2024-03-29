import { createContext, useContext } from "react"
import {
    makeAutoObservable,
    reaction,
    makeObservable,
    computed,
    observable
} from "mobx"
import { fromPromise, IPromiseBasedObservable } from "mobx-utils"
import Cookies from "js-cookie"
import { v4 as uuidv4 } from "uuid"
import { without } from "lodash-es"
import {
    Collection,
    Item,
    ItemState,
    WebsocketTransport,
    IndexedDbCollectionStore,
    ChannelClient
} from "sinkron-client"
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
