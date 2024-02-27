import { Result, ResultType } from "./utils/result"

const isAbortError = (e: Error) =>
    e instanceof DOMException && e.name === "AbortError"

export interface FetchParams {
    method?: "GET" | "POST"
    url: string
    data?: { [key: string]: any }
    signal?: AbortSignal
}

const defaultFetchParams = {
    method: "GET",
}

export type FetchErrorKind =
    | "fetch_error"
    | "abort"
    | "http"
    | "invalid_json"
    | "application_error"

export type FetchError = {
    kind: FetchErrorKind
    originalError?: any
    response?: Response
}

const fetchJson = async <T extends object = object>(
    params: FetchParams
): Promise<ResultType<T, FetchError>> => {
    const { url, method, data, signal } = { ...defaultFetchParams, ...params }

    const headers: { [key: string]: string } = { Accept: "application/json" }
    if (data !== undefined) {
        headers["Content-type"] = "application/json;charset=UTF-8"
    }

    const request = fetch(url, {
        method,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
        headers,
    })

    let response: Response | undefined = undefined
    try {
        response = await request
    } catch (e) {
        if (isAbortError(e as Error)) {
            return Result.err({ kind: "abort", originalError: e })
        }
        return Result.err({ kind: "fetch_error", originalError: e, response })
    }

    let json: Object | undefined
    const contentType = response.headers.get("content-type")
    if (contentType && contentType.indexOf("application/json") !== -1) {
        try {
            json = await response.json()
        } catch (e) {
            return Result.err({
                kind: "invalid_json",
                originalError: e,
                response,
            })
        }
    }
    if (!response.ok) {
        return Result.err({ kind: "http", data: json, response })
    }
    return Result.ok(json as T)
}

export { fetchJson }
