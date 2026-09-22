// General errors
export type BadRequestError = {
    code: "bad_request"
    message: string
}

export type AuthFailedError = {
    code: "auth_failed"
    message: string
}

export type NotFoundError = {
    code: "not_found"
    message: string
}

export type ForbiddenError = {
    code: "forbidden"
    message: string
}

export type InternalServerError = {
    code: "internal_server_error"
    message: string
}

export type UnprocessableContentError = {
    code: "unprocessable_content"
    message: string
}

// Collection & document errors
export type InvalidColrevError = {
    code: "invalid_colrev"
    // col_id
}

export type DuplicateDocumentIdError = {
    code: "duplicate_document"
    // col_id, doc_id
}

export type DocumentAlreadyDeletedError = {
    code: "document_already_deleted"
    // col_id, doc_id
}

export type InsufficientStorageError = {
    code: "insufficient_storage"
    // col_id, remaining_storage
}

export type ContentTooLargeError = {
    code: "content_too_large"
    // col_id
}

// File errors
export type FileNotFoundError = {
    code: "file_not_found"
    file_id: string
}

export type FileMissingChunksError = {
    code: "file_missing_chunks"
    file_id: string
}

export type FileTooLargeError = {
    code: "file_too_large"
    file_id: string
}

export type SinkronError =
    | BadRequestError
    | AuthFailedError
    | NotFoundError
    | ForbiddenError
    | InternalServerError
    | UnprocessableContentError
    | InvalidColrevError
    | DuplicateDocumentIdError
    | DocumentAlreadyDeletedError
    | InsufficientStorageError
    | ContentTooLargeError
    | FileNotFoundError
    | FileMissingChunksError
    | FileTooLargeError

export type ConnectionErrorMessage = {
    kind: "connection_error"
    i: number
}

export type HeartbeatMessage = {
    kind: "h"
    i: number
}

export type SyncStartMessage = {
    kind: "sync_start"
    col: string
    colrev: number
}

export type SyncStopMessage = {
    kind: "sync_stop"
    col: string
}

export type SyncErrorMessage = SinkronError & {
    kind: "sync_error"
    col: string
}

export type SyncCompleteMessage = {
    kind: "sync_complete"
    col: string
    colrev: number
}

export type GetMessage = {
    kind: "get"
    col: string
    id: string
}

export type GetErrorMessage = SinkronError & {
    kind: "get_error"
    col: string
    id: string
}

export type ClientCreateMessage = {
    kind: "create"
    col: string
    id: string
    content: string
    files: string[]
}

export type FilesUpdate = {
    add: string[]
    delete: string[]
}

export type ClientUpdateMessage = {
    kind: "update"
    col: string
    id: string
    content_update: string | null
    files_update: FilesUpdate | null
}

export type ClientDeleteMessage = {
    kind: "delete"
    col: string
    id: string
}

export type DocMessage = {
    kind: "dec"
    id: string
    col: string
    colrev: number
    content: string
    files: File[]
    created_at: string // iso8601
    updated_at: string // iso8601
}

export type ServerUpdateMessage = {
    kind: "update"
    col: string
    id: string
    colrev: number
    content_update: string | null
    files: File[]
    created_at: string // iso8601
    updated_at: string // iso8601
}

export type ServerDeleteMessage = {
    kind: "delete"
    col: string
    id: string
    colrev: number
}

export type ChangeErrorMessage = SinkronError & {
    kind: "change_error"
    col: string
    id: string
}

export type ClientMessage =
    | HeartbeatMessage
    | SyncStartMessage
    | SyncStopMessage
    | GetMessage
    | ClientCreateMessage
    | ClientUpdateMessage
    | ClientDeleteMessage

export type ServerMessage =
    | ConnectionErrorMessage
    | HeartbeatMessage
    | SyncCompleteMessage
    | SyncErrorMessage
    | GetErrorMessage
    | DocMessage
    | ServerUpdateMessage
    | ServerDeleteMessage
    | ChangeErrorMessage
