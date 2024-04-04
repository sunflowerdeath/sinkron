import { fetchJson, FetchError, FetchParams } from "./utils/fetchJson"

interface ApiError {
    error: { message: string } & object
}

const isApiError = (data: object | undefined): data is ApiError =>
    data !== undefined && "error" in data && typeof data.error === "object"

interface ApiProps {
    baseUrl?: string
    token?: string
    unauthorizedCallback?: () => void
}

class Api {
    baseUrl = ""
    token?: string
    unauthorizedCallback?: () => void

    constructor(props: ApiProps) {
        Object.assign(this, props)
    }

    fetch<T extends object>(params: FetchParams) {
        return fetchJson<T>({
            ...params,
            url: this.baseUrl + params.url,
            headers: {
                ...params.headers,
                "x-sinkron-auth-token": this.token
            }
        }).catch((error: FetchError) => {
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
