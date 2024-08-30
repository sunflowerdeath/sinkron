export enum ErrorCode {
    // Invalid request format
    InvalidRequest = "invalid_request",
    // User could not be authenticated, connection should be closed
    AuthenticationFailed = "auth_failed",
    // User doesn't have permission to perform the operation
    AccessDenied = "access_denied",
    // Operation cannot be performed
    UnprocessableRequest = "unprocessable_request",
    // Requested entity not found
    NotFound = "not_found",
    // Unexpected error
    InternalServerError = "internal_server_error"
}

export type RequestError = {
    code: ErrorCode
    message?: string
    details?: object
}
