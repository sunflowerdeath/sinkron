import { fetchJson, FetchError, FetchParams } from "./utils/fetchJson"

const authTokenHeader = "x-sinkron-auth-token"

export interface ApiError {
    error: { message: string } & { [key:string]: any }
}

const isApiError = (data: object | undefined): data is ApiError =>
    data !== undefined && "error" in data && typeof data.error === "object"

export interface ApiProps {
    baseUrl?: string
    getToken: () => string | undefined
    unauthorizedCallback?: () => void
}

class Api {
    baseUrl = ""
    getToken!: () => string | undefined
    unauthorizedCallback?: () => void

    constructor(props: ApiProps) {
        Object.assign(this, props)
    }

    fetch<T extends object>(params: FetchParams) {
        const { url, headers, ...rest } = params
        const token = this.getToken()
        const fetchParams = {
            ...rest,
            url: this.baseUrl + url,
            headers: token
                ? { ...headers, [authTokenHeader]: token }
                : headers
        }
        return fetchJson<T>(fetchParams).catch((error: FetchError) => {
            // TODO handle http 401
            if (error.kind === "http" && isApiError(error.data)) {
                throw new FetchError({
                    kind: "application",
                    message: error.data.error.message,
                    data: error.data.error
                })
            }
            throw error
        })
    }
}

export { Api }
