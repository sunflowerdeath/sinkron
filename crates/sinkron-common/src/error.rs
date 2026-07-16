use std::fmt;

use log::error;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "code")]
pub enum SinkronError {
    // General errors
    BadRequest { message: String },
    AuthFailed { message: String },
    NotFound { message: String },
    Forbidden { message: String },
    InternalServerError { message: String },
    UnprocessableContent { message: String },

    // Collection & document errors
    InvalidColrev, // { col_id }
    DuplicateDocumentId, // { col_id, doc_id }
    DocumentAlreadyDeleted, // { col_id, doc_id }
    InsufficientStorage, // { col_id, remaining_storage }
    ContentTooLarge, // { col_id }

    // File errors
    FileNotFound { file_id: Uuid },
    FileMissingChunks { file_id: Uuid },
    FileTooLarge { file_id: Uuid },
    FileInvalidChecksum { file_id: Uuid },
}

impl fmt::Display for SinkronError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SinkronError::BadRequest { message } => {
                write!(f, "Bad Request: {}", message)
            }
            SinkronError::AuthFailed { message } => {
                write!(f, "Auth Failed: {}", message)
            }
            SinkronError::NotFound { message } => {
                write!(f, "Not found: {}", message)
            }
            SinkronError::Forbidden { message } => {
                write!(f, "Forbidden: {}", message)
            }
            SinkronError::UnprocessableContent { message } => {
                write!(f, "Unprocessable Content: {}", message)
            }
            SinkronError::InternalServerError { message } => {
                write!(f, "Internal Server Error: {}", message)
            }
            SinkronError::InvalidColrev => {
                write!(f, "Invalid colrev")
            }
            SinkronError::DuplicateDocumentId => {
                write!(f, "Duplicate document id")
            }
            SinkronError::DocumentAlreadyDeleted => {
                write!(f, "Document already Deleted")
            }
            SinkronError::InsufficientStorage => {
                write!(f, "Insufficient storage")
            }
            SinkronError::ContentTooLarge => {
                write!(f, "Content too large")
            }
            SinkronError::FileNotFound { file_id } => {
                write!(f, "File not found: {}", file_id)
            }
            SinkronError::FileMissingChunks { file_id } => {
                write!(f, "File missing chunks: {}", file_id)
            }
            SinkronError::FileTooLarge { file_id } => {
                write!(f, "File too large: {}", file_id)
            }
            SinkronError::FileInvalidChecksum { file_id } => {
                write!(f, "File invalid checksum: {}", file_id)
            }
        }
    }
}

impl std::error::Error for SinkronError {}

impl SinkronError {
    pub fn bad_request(msg: &str) -> Self {
        Self::BadRequest {
            message: msg.to_string(),
        }
    }
    pub fn auth_failed(msg: &str) -> Self {
        Self::AuthFailed {
            message: msg.to_string(),
        }
    }
    pub fn not_found(msg: &str) -> Self {
        Self::NotFound {
            message: msg.to_string(),
        }
    }
    pub fn forbidden(msg: &str) -> Self {
        Self::Forbidden {
            message: msg.to_string(),
        }
    }
    pub fn internal(msg: &str) -> Self {
        Self::InternalServerError {
            message: msg.to_string(),
        }
    }
    pub fn unprocessable(msg: &str) -> Self {
        Self::UnprocessableContent {
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
