import { makeObservable, computed } from "mobx"

import env from "~/env"
import { matchPath } from "~/utils/matchPath"

const parseDeepLinkPath = (path: string): DeepLink | undefined => {
    const match = matchPath({
        pattern: "/link/:spaceId/:docId",
        path
    })
    return match === undefined ? undefined : (match as DeepLink)
}

const parseDeepLinkUrl = (url: string): DeepLink | undefined => {
    const parsedUrl = URL.parse(url)
    if (parsedUrl !== null && parsedUrl.origin === env.linksOrigin) {
        return parseDeepLinkPath(parsedUrl.pathname)
    } else {
        return undefined
    }
}

export type DocumentDeepLink = {
    kind: "document"
    spaceId: string
    docId: string
}

export type DeepLink = DocumentDeepLink

export type DeepLinkState =
    | { status: "pending" }
    | { status: "failed"; message: string }
    | { status: "cancelled" }
    | { status: "resolved" }

class DeepLinkController {
    link: DeepLink
    state: DeepLinkState = { status: "pending" }

    constructor(link: DeepLink) {
        this.link = link

        makeObservable(this, {
            state: true,
            isResolved: computed
        })
    }

    get isResolved() {
        return this.state.status !== "pending"
    }

    resolve(state: DeepLinkState) {
        if (!this.isResolved) this.state = state
    }
}

export { DeepLinkController, parseDeepLinkPath, parseDeepLinkUrl }
