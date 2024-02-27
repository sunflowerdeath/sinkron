export declare enum ErrorCode {
    InvalidRequest = "invalid_request",
    AuthenticationFailed = "auth_failed",
    AccessDenied = "access_denied",
    UnprocessableRequest = "unprocessable_request",
    NotFound = "not_found",
    InternalServerError = "internal_server_error"
}
export type SyncMessage = {
    kind: "sync";
    token: string;
    col: string;
    colrev?: number;
};
export type DocMessage = {
    kind: "doc";
    id: string;
    col?: string;
    data: string | null;
    createdAt: string;
    updatedAt: string;
};
export type SyncErrorMessage = {
    kind: "sync_error";
    col: string;
    code: ErrorCode;
};
export type SyncCompleteMessage = {
    kind: "sync_complete";
    col: string;
    colrev: number;
};
export declare enum Op {
    Create = "+",
    Modify = "M",
    Delete = "-"
}
interface BaseChangeMessage {
    kind: "change";
    col: string;
    id: string;
    changeid: string;
    colrev?: number;
    createdAt?: string;
    updatedAt?: string;
}
export interface CreateMessage extends BaseChangeMessage {
    op: Op.Create;
    data: string;
}
export interface ModifyMessage extends BaseChangeMessage {
    op: Op.Modify;
    data: string[];
}
export interface DeleteMessage extends BaseChangeMessage {
    op: Op.Delete;
}
export type ChangeMessage = CreateMessage | ModifyMessage | DeleteMessage;
export type ErrorMessage = {
    kind: "error";
    code: ErrorCode;
    id: string;
    changeid: string;
};
export type ClientMessage = SyncMessage | ChangeMessage;
export type ServerMessage = SyncErrorMessage | SyncCompleteMessage | DocMessage | ChangeMessage | ErrorMessage;
export {};
