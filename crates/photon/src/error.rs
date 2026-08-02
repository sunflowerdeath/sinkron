use serde::Serialize;

#[derive(Serialize)]
pub enum ErrorCode {
    // Invalid request format
    InvalidRequest,
    // User could not be authenticated, connection should be closed
    AuthenticationFailed,
    // User doesn't have permission to perform the operation
    AccessDenied,
    // Operation cannot be performed
    UnprocessableRequest,
    // Requested entity not found
    NotFound,
    // Unexpected error
    InternalServerError,
}

#[derive(Serialize)]
pub struct RequestError {
    pub code: ErrorCode,
    pub message: String,
}

/// Utility function for mapping any error into an Internal Server Error
pub fn internal_error<E>(err: E) -> RequestError
where
    E: std::error::Error,
{
    // error!("internal error: {:?}", err);
    RequestError {
        code: ErrorCode::InternalServerError,
        message: err.to_string()
    }
}
