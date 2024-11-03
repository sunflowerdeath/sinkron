// import { createNanoEvents } from "nanoevents"
// import { v4 as uuid } from "uuid"
import { LoroDoc } from "loro-crdt"
import { Base64 } from "js-base64"
import { parseISO } from "date-fns"

import { Permissions } from "./permissions"

export type ResultType<T, E = Error> =
    | { isOk: true; value: T }
    | { isOk: false; error: E }

const Result = {
    ok: <T, E>(value: T): ResultType<T, E> => ({ isOk: true, value }),
    err: <T, E>(error: E): ResultType<T, E> => ({ isOk: false, error })
}

export enum ErrorCode {
    FetchError = "fetch_error",
    // RequestAborted = "request_aborted",
    InvalidResponse = "invalid_response",
    AuthFailed = "auth_failed",
    BadRequest = "bad_request",
    NotFound = "not_found",
    Forbidden = "forbidden",
    UnprocessableContent = "unprocessable_content",
    InternalServerError = "internal_server_error"
}

export type SinkronError = {
    code: ErrorCode
    message: string
}

type SinkronErrorResponse = { error: SinkronError }

const isSinkronErrorResponse = (data: any): data is SinkronErrorResponse =>
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "object"

type RawCollection = {
    id: string
    is_ref: boolean
    colrev: string
    permissions: string
}

export type Collection = {
    id: string
    is_ref: boolean
    colrev: string
    permissions: Permissions
}

type RawDocument = {
    id: string
    createdAt: string
    updatedAt: string
    col: string
    colrev: string
    data: null | string
    permissions: string
}

export type Document = {
    id: string
    createdAt: Date
    updatedAt: Date
    col: string
    colrev: string
    data: null | Uint8Array
    permissions: Permissions
}

const parseCollection = (raw: RawCollection): Collection => {
    return {
        ...raw,
        permissions: Permissions.parse(raw.permissions)
    }
}

const parseDocument = (raw: RawDocument): Document => {
    let { data, createdAt, updatedAt, permissions } = raw
    let parsed = {
        ...raw,
        data: data === null ? data : Base64.toUint8Array(data),
        createdAt: parseISO(createdAt),
        updatedAt: parseISO(updatedAt),
        permissions: Permissions.parse(permissions)
    }
    return parsed
}

type SinkronApiProps = {
    url: string
    token: string
}

class SinkronApi {
    constructor(props: SinkronClientProps) {
        this.url = props.url.replace(/\/$/, "")
        this.token = props.token
    }

    url: string
    token: string

    async send<T>(
        method: string,
        payload: object
    ): Promise<ResultType<T, SinkronError>> {
        let url = `${this.url}/${method}`
        let request = fetch(url, {
            method: "POST",
            headers: {
                accept: "application/json",
                "x-sinkron-api-token": this.token
            },
            body: JSON.stringify(payload)
        })

        let response: Response | undefined = undefined
        try {
            response = await request
        } catch (e) {
            // if (isAbortError(e)) {
            // return Result.err({
            // code: ErrorCode.RequestAborted,
            // message: "Request was aborted"
            // })
            // }
            return Result.err({
                code: ErrorCode.FetchError,
                message: "Couldn't fetch",
                details: { originalError: e, response }
            })
        }

        const contentType = response.headers.get("content-type")
        let isJson =
            contentType && contentType.indexOf("application/json") !== -1

        const parseJson = async (): Promise<
            ResultType<object, SinkronError>
        > => {
            try {
                return Result.ok(await response.json())
            } catch (e) {
                return Result.err({
                    code: ErrorCode.InvalidResponse,
                    message: "Couldn't parse response",
                    details: { originalError: e, response }
                })
            }
        }

        if (response.ok) {
            if (isJson) {
                const res = await parseJson()
                if (!res.isOk) return res
                return Result.ok(res.value as T)
            } else {
                return Result.err({
                    code: ErrorCode.InvalidResponse,
                    message:
                        "Invalid response content type, " +
                        "required 'application/json'",
                    details: { response }
                })
            }
        } else {
            if (isJson) {
                const res = await parseJson()
                if (!res.isOk) return res
                if (isSinkronErrorResponse(res.value)) {
                    return Result.err(res.value.error)
                }
            }
            return Result.err({
                code: ErrorCode.InternalServerError,
                message: "Unknown error",
                details: { response }
            })
        }
    }

    // Collections

    async createCollection({
        id,
        permissions
    }: {
        id: string
        permissions: Permissions
    }): Promise<ResultType<Collection, SinkronError>> {
        let res = await this.send<RawCollection>("create_collection", {
            id,
            permissions: permissions.stringify()
        })
        if (!res.isOk) return res
        return Result.ok(parseCollection(res.value))
    }

    async getCollection(
        id: string
    ): Promise<ResultType<Collection, SinkronError>> {
        let res = await this.send<RawCollection>("get_collection", { id })
        if (!res.isOk) return res
        return Result.ok(parseCollection(res.value))
    }

    async deleteCollection(
        id: string
    ): Promise<ResultType<void, SinkronError>> {
        let res = await this.send<void>("delete_collection", { id })
        return res
    }

    // Documents

    async createDocument(
        id: string,
        col: string,
        data: object
    ): Promise<ResultType<Document, SinkronError>> {
        let res = await this.send<RawDocument>("create_document", {
            id,
            col,
            data
        })
        if (!res.isOk) return res
        return Result.ok(parseDocument(res.value))
    }

    async getDocument(
        id: string,
        col: string
    ): Promise<ResultType<Document, SinkronError>> {
        let res = await this.send<RawDocument>("get_document", { id, col })
        if (!res.isOk) return res
        return Result.ok(parseDocument(res.value))
    }

    async updateDocument(
        id: string,
        col: string,
        update: Uint8Array
    ): Promise<ResultType<Document, SinkronError>> {
        let res = await this.send<RawDocument>("update_document", {
            id,
            col,
            update
        })
        if (!res.isOk) return res
        return Result.ok(parseDocument(res.value))
    }

    async deleteDocument(
        id: string,
        col: string
    ): Promise<ResultType<Document, SinkronError>> {
        let res = await this.send<RawDocument>("delete_document", {
            id,
            col
        })
        if (!res.isOk) return res
        return Result.ok(parseDocument(res.value))
    }

    async updateDocumentWithCallback(
        id: string,
        col: string,
        cb: (doc: LoroDoc) => void
    ): Promise<ResultType<Document, SinkronError>> {
        let res = await this.getDocument(id, col)
        if (!res.isOk) return res

        let doc = res.value
        if (doc.data === null) {
            return Result.err({
                code: ErrorCode.UnprocessableContent,
                message: "Can't update deleted document"
            })
        }
        let loro = new LoroDoc()
        loro.import(doc.data)

        let version = loro.version()
        cb(loro)
        if (loro.version() === version) {
            return Result.err({
                code: ErrorCode.UnprocessableContent,
                message: "Empty update"
            })
        }
        let update = loro.export({ mode: "update", from: version })

        return this.updateDocument(id, col, update)
    }

    // Groups and users

    async createGroup(
        group: string
    ): Promise<ResultType<undefined, SinkronError>> {
        let res = await this.send<RawDocument>("create_group", { group })
        if (!res.isOk) return res
        return Result.ok(undefined)
    }

    async deleteGroup(
        group: string
    ): Promise<ResultType<undefined, SinkronError>> {
        let res = await this.send<RawDocument>("delete_group", { group })
        if (!res.isOk) return res
        return Result.ok(undefined)
    }

    async addUserToGroup(
        user: string,
        group: string
    ): Promise<ResultType<void, SinkronError>> {
        let res = await this.send<RawDocument>("add_user_to_group", {
            group,
            user
        })
        if (!res.isOk) return res
        return Result.ok(undefined)
    }

    async removeUserFromGroup(
        group: string,
        user: string
    ): Promise<ResultType<void, SinkronError>> {
        let res = await this.send<RawDocument>("remove_user_from_group", {
            group,
            user
        })
        if (!res.isOk) return res
        return Result.ok(undefined)
    }

    async removeUserFromAllGroups(
        user: string
    ): Promise<ResultType<void, SinkronError>> {
        let res = await this.send<RawDocument>("remove_user_from_all_groups", {
            user
        })
        if (!res.isOk) return res
        return Result.ok(undefined)
    }

    // Permissions

    // async updateCollectionPermission(id, cb(p: Permissions) => void)
    // async updateDocumentPermission(id, cb(p: Permissions) => void)
    // ? async checkDocumentPermission
    // ? async checkDocumentPermission
}

export { SinkronApi }
