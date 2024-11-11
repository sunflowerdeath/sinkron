export type ErrorCode =
    // Invalid request format
    | "invalid_request"
    // User could not be authenticated
    | "auth_failed"
    // User doesn't have permission to perform the operation
    | "access_denied"
    // Operation cannot be performed
    | "unprocessable_request"
    // Requested entity not found
    | "not_found"
    | "internal_server_error"

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

export type GetMessage = {
    kind: "get"
    id: string
    col?: string
}

export type Op = "+" | "M" | "-"

interface BaseChangeMessage {
    kind: "change"

    // These fields are sent by both client and server:
    op: Op
    col: string
    id: string
    changeid: string

    // These fields are sent by server in the response to the change:
    colrev?: number
    createdAt?: string // iso8601 time
    updatedAt?: string // iso8601 time
}

export interface CreateMessage extends BaseChangeMessage {
    op: "+"
    data: string
}

export interface ModifyMessage extends BaseChangeMessage {
    op: "M"
    data: string[]
}

export interface DeleteMessage extends BaseChangeMessage {
    op: "-"
}

export type ChangeMessage = CreateMessage | ModifyMessage | DeleteMessage

export type ChangeErrorMessage = {
    kind: "change_error"
    code: ErrorCode
    id: string
    changeid?: string
}

export type HeartbeatMessage = {
    kind: "h"
    i: number
}

export type ClientMessage =
    | SyncMessage
    | ChangeMessage
    | GetMessage
    | HeartbeatMessage

export type ServerMessage =
    | SyncErrorMessage
    | SyncCompleteMessage
    | DocMessage
    | ChangeMessage
    | ChangeErrorMessage
    | HeartbeatMessage
