use serde::Serialize;

#[derive(Serialize)]
pub enum ErrorCode {
    // Invalid request format
    BadRequest,
    // User could not be authenticated, connection should be closed
    AuthFailed,
    // User doesn't have permission to perform the operation
    Forbidden,
    // Operation cannot be performed
    UnprocessableContent,
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

impl RequestError {
    pub fn bad_request(msg: &str) -> Self {
        Self {
            code: ErrorCode::BadRequest,
            message: msg.to_string(),
        }
    }
    pub fn auth_failed(msg: &str) -> Self {
        Self {
            code: ErrorCode::AuthFailed,
            message: msg.to_string(),
        }
    }
    pub fn not_found(msg: &str) -> Self {
        Self {
            code: ErrorCode::NotFound,
            message: msg.to_string(),
        }
    }
    pub fn forbidden(msg: &str) -> Self {
        Self {
            code: ErrorCode::Forbidden,
            message: msg.to_string(),
        }
    }
    pub fn internal(msg: &str) -> Self {
        Self {
            code: ErrorCode::InternalServerError,
            message: msg.to_string(),
        }
    }
    pub fn unprocessable(msg: &str) -> Self {
        Self {
            code: ErrorCode::UnprocessableContent,
            message: msg.to_string(),
        }
    }
}

/// Utility function for mapping any error into an Internal Server Error
pub fn internal_error<E>(err: E) -> RequestError
where
    E: std::error::Error,
{
    // error!("internal error: {:?}", err);
    RequestError {
        code: ErrorCode::InternalServerError,
        message: err.to_string(),
    }
}
