export type ErrorCode =
    | "bad_request"
    | "auth_failed"
    | "not_found"
    | "forbidden"
    | "unprocessable_content"
    | "internal_server_error"

export type HeartbeatMessage = {
    kind: "h"
    i: number
}

export type SyncErrorMessage = {
    kind: "sync_error"
    col: string
    code: ErrorCode
}

export type SyncCompleteMessage = {
    kind: "sync_complete"
    col: string
    colrev: string
}

export type GetMessage = {
    kind: "get"
    id: string // uuid
    col: string
}

export type GetErrorMessage = {
    kind: "get_error"
    id: string // uuid
    code: ErrorCode
}

export type DocMessage = {
    kind: "doc"
    id: string // uuid
    col: string
    colrev: string
    data: string | null
    createdAt: string // iso8601
    updatedAt: string // iso8601
}

export enum Op {
    Create = "+",
    Delete = "-",
    Update = "*"
}

interface BaseClientChangeMessage {
    kind: "change"
    id: string // uuid
    col: string
    changeid: string // uuid
}

export interface ClientCreateMessage extends BaseClientChangeMessage {
    op: Op.Create
    data: string
}

export interface ClientUpdateMessage extends BaseClientChangeMessage {
    op: Op.Update
    data: string
}

export interface ClientDeleteMessage extends BaseClientChangeMessage {
    op: Op.Delete
    data: null
}

export type ClientChangeMessage =
    | ClientCreateMessage
    | ClientUpdateMessage
    | ClientDeleteMessage

interface BaseServerChangeMessage extends BaseClientChangeMessage {
    colrev: string
    createdAt: string // iso8601
    updatedAt: string // iso860,
}

export interface ServerCreateMessage extends BaseServerChangeMessage {
    op: Op.Create
    data: string
}

export interface ServerUpdateMessage extends BaseServerChangeMessage {
    op: Op.Update
    data: string
}

export interface ServerDeleteMessage extends BaseServerChangeMessage {
    op: Op.Delete
    data: null
}

export type ServerChangeMessage =
    | ServerCreateMessage
    | ServerUpdateMessage
    | ServerDeleteMessage

export type ChangeErrorMessage = {
    kind: "change_error"
    code: ErrorCode
    id: string // uuid
    changeid: string
}

export type ClientMessage = HeartbeatMessage | GetMessage | ClientChangeMessage

export type ServerMessage =
    | HeartbeatMessage
    | SyncCompleteMessage
    | SyncErrorMessage
    | GetErrorMessage
    | DocMessage
    | ServerChangeMessage
    | ChangeErrorMessage
