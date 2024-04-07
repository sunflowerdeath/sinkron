import { fetchJson, FetchParams, FetchError } from "./utils/fetchJson.ts"

export interface ApiError {
    error: { message: string } & object
}

const authTokenHeader = "x-sinkron-token"

const isApiError = (data: object | undefined): data is ApiError =>
    data !== undefined && "error" in data && typeof data.error === "object"

class Api {
    constructor() {}

    baseUrl: string = ""

    fetch<T>(params: FetchParams) {
        const { url, headers, ...rest } = params
        const fetchParams = {
            url: `${this.baseUrl}${url}`,
            headers: { ...headers, [authTokenHeader]: "token" },
            ...rest
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

export default Api
