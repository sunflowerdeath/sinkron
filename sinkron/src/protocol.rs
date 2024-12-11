use uuid::Uuid;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum ErrorCode {
    #[serde(rename = "bad_request")]
    BadRequest,
    #[serde(rename = "auth_failed")]
    AuthFailed,
    #[serde(rename = "not_found")]
    NotFound,
    #[serde(rename = "forbidden")]
    Forbidden,
    #[serde(rename = "unprocessable_content")]
    UnprocessableContent,
    #[serde(rename = "internal_server_error")]
    InternalServerError,
}

#[derive(Serialize, Deserialize)]
pub struct HeartbeatMessage {
    pub i: i32,
}

#[derive(Serialize, Deserialize)]
pub struct SyncErrorMessage {
    pub col: String,
    pub code: ErrorCode,
}

#[derive(Serialize, Deserialize)]
pub struct SyncCompleteMessage {
    pub col: String,
    pub colrev: i64,
}

#[derive(Serialize, Deserialize)]
pub struct GetMessage {
    pub id: Uuid,
    pub col: String,
}

#[derive(Serialize, Deserialize)]
pub struct GetErrorMessage {
    pub id: Uuid,
    pub code: ErrorCode
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocMessage {
    pub id: Uuid,
    pub col: String,
    pub colrev: i64,
    pub data: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, Deserialize)]
pub enum Op {
    #[serde(rename = "+")]
    Create,
    #[serde(rename = "-")]
    Delete,
    #[serde(rename = "*")]
    Update,
}

#[derive(Serialize, Deserialize)]
pub struct ClientChangeMessage {
    pub id: Uuid,
    pub col: String,
    pub op: Op,
    pub data: Option<String>,
    pub changeid: Uuid,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerChangeMessage {
    pub id: Uuid,
    pub col: String,
    pub op: Op,
    pub data: Option<String>,
    pub changeid: Uuid,
    pub colrev: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, Deserialize)]
pub struct ChangeErrorMessage {
    pub code: ErrorCode,
    pub id: Uuid,
    pub changeid: Uuid,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ClientMessage {
    #[serde(rename = "h")]
    Heartbeat(HeartbeatMessage),

    #[serde(rename = "get")]
    Get(GetMessage),

    #[serde(rename = "change")]
    Change(ClientChangeMessage),
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ServerMessage {
    #[serde(rename = "h")]
    Heartbeat(HeartbeatMessage),

    #[serde(rename = "sync_complete")]
    SyncComplete(SyncCompleteMessage),

    #[serde(rename = "sync_error")]
    SyncError(SyncErrorMessage),

    #[serde(rename = "get_error")]
    GetError(GetErrorMessage),

    #[serde(rename = "doc")]
    Doc(DocMessage),

    #[serde(rename = "change")]
    Change(ServerChangeMessage),

    #[serde(rename = "change_error")]
    ChangeError(ChangeErrorMessage),
}
