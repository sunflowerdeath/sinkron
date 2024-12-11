use log::error;

use crate::protocol::ErrorCode;

#[derive(serde::Serialize, Debug)]
pub struct SinkronError {
    pub code: ErrorCode,
    pub message: String,
}

impl SinkronError {
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
    pub fn unprocessable(msg: &str) -> Self {
        Self {
            code: ErrorCode::UnprocessableContent,
            message: msg.to_string(),
        }
    }
    pub fn internal(msg: &str) -> Self {
        Self {
            code: ErrorCode::InternalServerError,
            message: msg.to_string(),
        }
    }
}

/// Utility function for mapping any error into an Internal Server Error
pub fn internal_error<E>(err: E) -> SinkronError
where
    E: std::error::Error,
{
    error!("internal error: {:?}", err);
    SinkronError::internal(&err.to_string())
}
