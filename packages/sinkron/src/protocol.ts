export enum ErrorCode {
    // Invalid request format
    InvalidRequest = "invalid_request",

    // User could not be authenticated, connection will be closed
    AuthenticationFailed = "auth_failed",

    // User doesn't have permission to perform the operation
    AccessDenied = "access_denied",

    // Operation cannot be performed
    UnprocessableRequest = "unprocessable_request",

    // Requested entity not found
    NotFound = "not_found",

    InternalServerError = "internal_server_error",
}

export type SyncMessage = {
    kind: "sync"
    token: string
    col: string
    colrev?: number
}

export type DocMessage = {
    kind: "doc"
    id: string
    col?: string
    data: string | null
    createdAt: string // iso8601 time
    updatedAt: string // iso8601 time
}

export type GetMessage = {
    kind: "get"
    id: string
    col?: string
}

export type SyncErrorMessage = {
    kind: "sync_error"
    col: string
    code: ErrorCode
}

export type SyncCompleteMessage = {
    kind: "sync_complete"
    col: string
    colrev: number
}

export enum Op {
    Create = "+",
    Modify = "M",
    Delete = "-",
}

interface BaseChangeMessage {
    kind: "change"

    // These fields are sent by both client and server:
    col: string
    id: string
    changeid: string

    // These fields are sent by server in the response to the change:
    colrev?: number
    createdAt?: string // iso8601 time
    updatedAt?: string // iso8601 time
}

export interface CreateMessage extends BaseChangeMessage {
    op: Op.Create
    data: string
}

export interface ModifyMessage extends BaseChangeMessage {
    op: Op.Modify
    data: string[]
}

export interface DeleteMessage extends BaseChangeMessage {
    op: Op.Delete
}

export type ChangeMessage = CreateMessage | ModifyMessage | DeleteMessage

export type ErrorMessage = {
    kind: "error"
    code: ErrorCode
    id: string
    changeid: string
}

export type ClientMessage = SyncMessage | ChangeMessage | GetMessage

export type ServerMessage =
    | SyncErrorMessage
    | SyncCompleteMessage
    | DocMessage
    | ChangeMessage
    | ErrorMessage
