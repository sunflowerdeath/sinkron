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

enum ErrorCode {
    FetchError = "fetch_error",
    RequestAborted = "request_aborted",
    JsonParseError = "json_parse_error",
    AuthFailed = "auth_failed",
    BadRequest = "bad_request",
    NotFound = "not_found",
    Forbidden = "forbidden",
    UnprocessableContent = "unprocessable_content",
    InternalServerError = "internal_server_error"
}

type SinkronError = {
    code: ErrorCode
    message: string
}

type RawCollection = {
    id: string
    is_ref: boolean
    colrev: string
    permissions: string
}

type Collection = {
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

type Document = {
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

type SinkronClientProps = {
    url: string
    token: string
}

class SinkronClient {
    constructor(props: SinkronClientProps) {
        this.url = props.url
        this.token = props.token
    }

    url: string
    token: string

    async send<T>(
        method: string,
        payload: object
    ): Promise<ResultType<T, SinkronError>> {
        let url = this.url + method
        let res = await fetch(url, {
            method: "POST",
            headers: {
                Accept: "application/json"
            },
            body: JSON.stringify(payload)
        })
    }

    // Collections

    async createCollection(
        id: string,
        permissions: Permissions
    ): Promise<ResultType<Collection, SinkronError>> {
        let res = await this.send<RawCollection>("create_collection", {
            id,
            permissions
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

    // Groups

    async createGroup(
        user: string,
        group: string
    ): Promise<ResultType<void, SinkronError>> {}
    async addUserToGroup(
        user: string,
        group: string
    ): Promise<ResultType<void, SinkronError>> {}
    async removeUserFromGroup(
        group: string,
        user: string
    ): Promise<ResultType<void, SinkronError>> {}
    async removeUserFromAllGroups(
        user: string
    ): Promise<ResultType<void, SinkronError>> {}

    // Permissions

    // async updateCollectionPermission
}

export { SinkronClient }
