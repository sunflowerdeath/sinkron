const isAbortError = (e: Error) =>
    e instanceof DOMException && e.name === "AbortError"

export interface FetchParams {
    method?: "GET" | "POST"
    url: string
    data?: { [key: string]: any }
    signal?: AbortSignal
    headers?: { [key: string]: string }
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
    fetch_error: "Couldn't connect to server",
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
    const { url, method, data, headers /*, signal */ } = {
        ...defaultFetchParams,
        ...params
    }

    const reqHeaders: { [key: string]: string } = {
        ...headers,
        Accept: "application/json"
    }
    let body: string | Blob | undefined = undefined
    if (data !== undefined) {
        if (data instanceof Blob) {
            reqHeaders["Content-type"] = "application/octet-stream"
            body = data
        } else {
            reqHeaders["Content-type"] = "application/json;charset=UTF-8"
            body = JSON.stringify(data)
        }
    }
    const request = fetch(url, {
        method,
        body,
        credentials: "include",
        headers: reqHeaders
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
    // const contentType = response.headers.get("content-type")
    // if (contentType && contentType.indexOf("application/json") !== -1) {
    try {
        json = await response.json()
    } catch (e) {
        throw new FetchError({
            kind: "invalid_json",
            originalError: e,
            response
        })
    }
    // }
    if (!response.ok) {
        throw new FetchError({ kind: "http", data: json, response })
    }
    return json as T
}

export { fetchJson, FetchError }
