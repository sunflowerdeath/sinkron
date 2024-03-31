const isAbortError = (e: Error) =>
    e instanceof DOMException && e.name === "AbortError"

export interface FetchParams {
    method?: "GET" | "POST"
    url: string
    data?: { [key: string]: any }
    signal?: AbortSignal
}

const defaultFetchParams = {
    method: "GET"
}

export type FetchErrorKind =
    | "fetch_error"
    | "abort"
    | "http"
    | "invalid_json"
    | "application"

const fetchErrorMessages: { [key: string]: string } = {
    fetch_error: "Check your internet connection and try again",
    abort: "Request was aborted",
    http: "Server error",
    json: "Server error"
}

class FetchError extends Error {
    originalError?: any
    kind: FetchErrorKind
    data?: object
    response?: Response

    constructor({
        kind,
        originalError,
        data,
        response,
        message
    }: {
        kind: FetchErrorKind
        originalError?: any
        data?: object
        response?: Response
        message?: string
    }) {
        super(message || fetchErrorMessages[kind])
        this.name = "FetchError"
        this.kind = kind
        this.originalError = originalError
        this.data = data
        this.response = response
    }

    toString() {
        return this.message
    }
}

const fetchJson = async <T extends object = object>(
    params: FetchParams
): Promise<T> => {
    const { url, method, data, signal } = { ...defaultFetchParams, ...params }

    const headers: { [key: string]: string } = { Accept: "application/json" }
    if (data !== undefined) {
        headers["Content-type"] = "application/json;charset=UTF-8"
    }

    const request = fetch(url, {
        method,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
        headers
    })

    let response: Response | undefined = undefined
    try {
        response = await request
    } catch (e) {
        if (isAbortError(e as Error)) {
            throw new FetchError({ kind: "abort", originalError: e })
        }
        throw new FetchError({
            kind: "fetch_error",
            originalError: e,
            response
        })
    }

    let json: object | undefined
    const contentType = response.headers.get("content-type")
    if (contentType && contentType.indexOf("application/json") !== -1) {
        try {
            json = await response.json()
        } catch (e) {
            throw new FetchError({
                kind: "invalid_json",
                originalError: e,
                response
            })
        }
    }
    if (!response.ok) {
        throw new FetchError({ kind: "http", data: json, response })
    }
    return json as T
}

interface ApiError {
    error: { message: string } & object
}

const isApiError = (data: object | undefined): data is ApiError =>
    data !== undefined && "error" in data && typeof data.error === "object"

const fetchApi = async <T extends object = object>(
    params: FetchParams
): Promise<T> => {
    return fetchJson<T>(params).catch((error: FetchError) => {
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

export { fetchJson, fetchApi, FetchError }
