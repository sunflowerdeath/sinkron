import { SinkronError } from "./protocol"
import { type ResultType, Result } from "./utils/result"

type InitFileUpload = {
    colId: string
    fileId: string
    size: number
    // TODO checksum: string
    // TODO contentType: string
}

type UploadFileChunk = {
    colId: string
    fileId: string
    chunkNumber: number
    data: Blob
}

type FileApiProps = {
    url: string
    authToken: string
}

export type ApiError =
    | { kind: "request_error"; message: string }
    | { kind: "parse_error"; message: string }
    | { kind: "application_error"; error: SinkronError }

type SinkronErrorResponse = {
    error: SinkronError
}

const isSinkronErrorResponse = (data: any): data is SinkronErrorResponse =>
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "object"

const parseResponseAsJson = async (
    response: Response,
): Promise<ResultType<object, ApiError>> => {
    try {
        return Result.ok(await response.json())
    } catch (e) {
        return Result.err({
            kind: "parse_error",
            message: "Couldn't parse server response",
            details: { originalError: e, response },
        })
    }
}

const sendApiRequest = async (
    request: Promise<Response>,
): Promise<ResultType<Response, ApiError>> => {
    let response: Response | undefined = undefined
    try {
        response = await request
    } catch (e) {
        return Result.err({
            kind: "request_error",
            message: "Couldn't send request",
            details: { originalError: e, response },
        })
    }

    if (response.ok) {
        return Result.ok(response)
    } else {
        const contentType = response.headers.get("content-type")
        const isJson =
            contentType && contentType.indexOf("application/json") !== -1
        if (isJson) {
            const res = await parseResponseAsJson(response)
            if (!res.isOk) return res
            if (isSinkronErrorResponse(res.value)) {
                return Result.err({
                    kind: "application_error",
                    error: res.value.error,
                })
            } else {
                return Result.err({
                    kind: "parse_error",
                    message: "Couldn't parse server response",
                    details: { response },
                })
            }
        } else {
            return Result.err({
                kind: "parse_error",
                message: "Couldn't parse server response",
                details: { response },
            })
        }
    }
}

const AUTH_HEADER = "x-sinkron-auth-token"

class FileApi {
    url: string
    authToken: string

    constructor(props: FileApiProps) {
        this.url = props.url
        this.authToken = props.authToken
    }

    async initFileUpload(
        props: InitFileUpload,
    ): Promise<ResultType<undefined, ApiError>> {
        const url = `${this.url}/files/init_file_upload`
        const request = fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                [AUTH_HEADER]: this.authToken,
            },
            body: JSON.stringify({
                ...props,
                checksum: "TODO",
            }),
        })
        let result = await sendApiRequest(request)
        if (!result.isOk) return result
        return Result.ok(undefined)
    }

    async uploadFileChunk(
        props: UploadFileChunk,
    ): Promise<ResultType<undefined, ApiError>> {
        const query = new URLSearchParams({
            colId: props.colId,
            fileId: props.fileId,
            chunkNumber: String(props.chunkNumber),
        }).toString()
        const url = `${this.url}/files/upload_file_chunk?${query}`
        const request = fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/octet-stream",
                [AUTH_HEADER]: this.authToken,
            },
            body: props.data,
        })
        let result = await sendApiRequest(request)
        if (!result.isOk) return result
        return Result.ok(undefined)
    }
}

export { FileApi }
