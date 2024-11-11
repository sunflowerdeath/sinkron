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

export type CreateCollectionProps = {
    id: string
    permissions: Permissions
}

export type GetDocumentProps = {
    id: string
    col: string
}

export type DeleteDocumentProps = GetDocumentProps

export type CreateDocumentProps = {
    id: string
    col: string
    data: Uint8Array
    // TODO permissions: Permissions
}

export type UpdateDocumentProps = {
    id: string
    col: string
    data: Uint8Array
}

export type UpdateDocumentWithCallbackProps = {
    id: string
    col: string
    cb: (doc: LoroDoc) => void
}

export type AddRemoveUserToGroupProps = {
    user: string
    group: string
}

export type UpdateCollectionPermissionsProps = {
    id: string
    permissions: Permissions
}

export type UpdateCollectionPermissionsWithCallbackProps = {
    id: string
    cb: (p: Permissions) => void
}

export type UpdateDocumentPermissionsProps = {
    id: string
    col: string
    permissions: Permissions
}

export type UpdateDocumentPermissionsWithCallbackProps = {
    id: string
    col: string
    cb: (p: Permissions) => void
}

const parseCollection = (raw: RawCollection): Collection => {
    return {
        ...raw,
        permissions: Permissions.parse(raw.permissions)
    }
}

const parseDocument = (raw: RawDocument): Document => {
    const { data, createdAt, updatedAt, permissions } = raw
    const parsed = {
        ...raw,
        data: data === null ? data : Base64.toUint8Array(data),
        createdAt: parseISO(createdAt),
        updatedAt: parseISO(updatedAt),
        permissions: Permissions.parse(permissions)
    }
    return parsed
}

export type SinkronApiProps = {
    url: string
    token: string
}

class SinkronApi {
    constructor(props: SinkronApiProps) {
        this.url = props.url.replace(/\/$/, "")
        this.token = props.token
    }

    url: string
    token: string

    async send<T>(
        method: string,
        payload: object
    ): Promise<ResultType<T, SinkronError>> {
        const url = `${this.url}/${method}`
        const request = fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
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
        const isJson =
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

    async createCollection(
        props: CreateCollectionProps
    ): Promise<ResultType<Collection, SinkronError>> {
        const { id, permissions } = props
        const res = await this.send<RawCollection>("create_collection", {
            id,
            is_ref: false,
            permissions: permissions.stringify()
        })
        if (!res.isOk) return res
        return Result.ok(parseCollection(res.value))
    }

    async getCollection(
        id: string
    ): Promise<ResultType<Collection, SinkronError>> {
        const res = await this.send<RawCollection>("get_collection", { id })
        if (!res.isOk) return res
        return Result.ok(parseCollection(res.value))
    }

    async deleteCollection(
        id: string
    ): Promise<ResultType<void, SinkronError>> {
        const res = await this.send<void>("delete_collection", { id })
        return res
    }

    // Documents

    async createDocument(
        props: CreateDocumentProps
    ): Promise<ResultType<Document, SinkronError>> {
        const { id, col, data } = props
        const res = await this.send<RawDocument>("create_document", {
            id,
            col,
            data: Base64.fromUint8Array(data)
        })
        if (!res.isOk) return res
        return Result.ok(parseDocument(res.value))
    }

    async getDocument(
        props: GetDocumentProps
    ): Promise<ResultType<Document, SinkronError>> {
        const res = await this.send<RawDocument>("get_document", props)
        if (!res.isOk) return res
        return Result.ok(parseDocument(res.value))
    }

    async updateDocument(
        props: UpdateDocumentProps
    ): Promise<ResultType<Document, SinkronError>> {
        const { id, col, data } = props
        const res = await this.send<RawDocument>("update_document", {
            id,
            col,
            data: Base64.fromUint8Array(data)
        })
        if (!res.isOk) return res
        return Result.ok(parseDocument(res.value))
    }

    async deleteDocument(
        props: DeleteDocumentProps
    ): Promise<ResultType<Document, SinkronError>> {
        const res = await this.send<RawDocument>("delete_document", props)
        if (!res.isOk) return res
        return Result.ok(parseDocument(res.value))
    }

    async updateDocumentWithCallback(
        props: UpdateDocumentWithCallbackProps
    ): Promise<ResultType<Document, SinkronError>> {
        const { id, col, cb } = props

        const res = await this.getDocument({ id, col })
        if (!res.isOk) return res

        const doc = res.value
        if (doc.data === null) {
            return Result.err({
                code: ErrorCode.UnprocessableContent,
                message: "Can't update deleted document"
            })
        }
        const loro = new LoroDoc()
        loro.import(doc.data)

        const version = loro.version()
        cb(loro)
        if (loro.version().compare(version) === 0) {
            return Result.err({
                code: ErrorCode.UnprocessableContent,
                message: "Empty update"
            })
        }
        const data = loro.export({ mode: "update", from: version })

        return this.updateDocument({ id, col, data })
    }

    // Groups and users

    async createGroup(
        group: string
    ): Promise<ResultType<undefined, SinkronError>> {
        const res = await this.send<RawDocument>("create_group", { group })
        if (!res.isOk) return res
        return Result.ok(undefined)
    }

    async deleteGroup(
        group: string
    ): Promise<ResultType<undefined, SinkronError>> {
        const res = await this.send<RawDocument>("delete_group", { group })
        if (!res.isOk) return res
        return Result.ok(undefined)
    }

    async addUserToGroup(
        props: AddRemoveUserToGroupProps
    ): Promise<ResultType<undefined, SinkronError>> {
        const { user, group } = props
        const res = await this.send<RawDocument>("add_user_to_group", {
            group,
            user
        })
        if (!res.isOk) return res
        return Result.ok(undefined)
    }

    async removeUserFromGroup(
        props: AddRemoveUserToGroupProps
    ): Promise<ResultType<undefined, SinkronError>> {
        const res = await this.send<RawDocument>(
            "remove_user_from_group",
            props
        )
        if (!res.isOk) return res
        return Result.ok(undefined)
    }

    async removeUserFromAllGroups(
        user: string
    ): Promise<ResultType<undefined, SinkronError>> {
        const res = await this.send<RawDocument>(
            "remove_user_from_all_groups",
            { user }
        )
        if (!res.isOk) return res
        return Result.ok(undefined)
    }

    // Permissions

    async updateCollectionPermissions(
        props: UpdateCollectionPermissionsProps
    ): Promise<ResultType<undefined, SinkronError>> {
        const { id, permissions } = props
        const res = await this.send<RawDocument>(
            "update_collection_permissions",
            { id, permissions: permissions.stringify() }
        )
        if (!res.isOk) return res
        return Result.ok(undefined)
    }

    async updateCollectionPermissionsWithCallback(
        props: UpdateCollectionPermissionsWithCallbackProps
    ): Promise<ResultType<undefined, SinkronError>> {
        const { id, cb } = props
        const getRes = await this.getCollection(id)
        if (!getRes.isOk) return getRes
        const col = getRes.value
        cb(col.permissions)
        return this.updateCollectionPermissions({
            id,
            permissions: col.permissions
        })
    }

    async updateDocumentPermissions(
        props: UpdateDocumentPermissionsProps
    ): Promise<ResultType<undefined, SinkronError>> {
        const { id, col, permissions } = props
        const res = await this.send<RawDocument>(
            "update_document_permissions",
            { id, col, permissions: permissions.stringify() }
        )
        if (!res.isOk) return res
        return Result.ok(undefined)
    }

    async updateDocumentPermissionsWithCallback(
        props: UpdateDocumentPermissionsWithCallbackProps
    ): Promise<ResultType<undefined, SinkronError>> {
        const { id, col, cb } = props
        // TODO shallow get (without data)
        const getRes = await this.getDocument({ id, col })
        if (!getRes.isOk) return getRes
        const doc = getRes.value
        cb(doc.permissions)
        return this.updateDocumentPermissions({
            id,
            col,
            permissions: doc.permissions
        })
    }
}

export { SinkronApi }
