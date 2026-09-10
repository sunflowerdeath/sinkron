use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::SinkronError;

/*
Client connects to server via webscokets. All messages must be prefixed
with an integer specifying a channel. It allows to synchronize multiple
collections at the same time using one connection.

Channel "0" is reserved for system messages.

The first message in the newly opened channel from the client must always be
"sync_start" message.

In case of success server replies with document updates messages required
to achieve synchronized state ("doc", "update" and "delete"), followed by
"sync_complete" message.

In case of error server sends "sync_error" message, after which the channel is
closed.

After successful synchronization client can start sending its own updates and
recieve realtime updates performed by other clients.

Invalid messages, e.g. messages to a closed channel, are simply ignored.
*/

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct HeartbeatMessage {
    pub i: i32,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct SyncStartMessage {
    pub col: String,
    pub colrev: i64,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct SyncStopMessage {
    pub col: String,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct SyncErrorMessage {
    pub col: String,
    #[serde(flatten)]
    pub error: SinkronError,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct SyncCompleteMessage {
    pub col: String,
    pub colrev: i64,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct GetMessage {
    pub col: String,
    pub id: Uuid,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct GetErrorMessage {
    pub col: String,
    pub id: Uuid,
    #[serde(flatten)]
    pub error: SinkronError,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct ClientCreateMessage {
    pub col: String,
    pub id: Uuid,
    pub content: String,
    pub files: Vec<Uuid>,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct FilesUpdate {
    pub add: Vec<Uuid>,
    pub delete: Vec<Uuid>,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdateMessage {
    pub col: String,
    pub id: Uuid,
    pub content_update: Option<String>,
    pub files_update: Option<FilesUpdate>,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct ClientDeleteMessage {
    pub col: String,
    pub id: Uuid,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocMessage {
    pub id: Uuid,
    pub col: String,
    pub colrev: i64,
    pub content: String,
    pub files: Vec<Uuid>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerUpdateMessage {
    pub col: String,
    pub id: Uuid,
    pub colrev: i64,
    pub content_update: Option<String>,
    pub files: Vec<Uuid>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct ServerDeleteMessage {
    pub col: String,
    pub id: Uuid,
    pub colrev: i64,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct ChangeErrorMessage {
    pub col: String,
    pub id: Uuid,
    #[serde(flatten)]
    pub error: SinkronError,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ClientMessage {
    #[serde(rename = "h")]
    Heartbeat(HeartbeatMessage),

    #[serde(rename = "sync_start")]
    SyncStart(SyncStartMessage),

    #[serde(rename = "sync_stop")]
    SyncStop(SyncStopMessage),

    #[serde(rename = "get")]
    Get(GetMessage),

    #[serde(rename = "create")]
    Create(ClientCreateMessage),

    #[serde(rename = "update")]
    Update(ClientUpdateMessage),

    #[serde(rename = "delete")]
    Delete(ClientDeleteMessage),
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ServerMessage {
    #[serde(rename = "connection_error")]
    ConnectionError(SinkronError),

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

    #[serde(rename = "update")]
    Update(ServerUpdateMessage),

    #[serde(rename = "delete")]
    Delete(ServerDeleteMessage),

    #[serde(rename = "change_error")]
    ChangeError(ChangeErrorMessage),
}

pub fn parse_channel_prefix(input: &str) -> Option<(i32, &str)> {
    // String must start with a number, followed by ":" symbol
    let mut len = 0;
    for c in input.chars() {
        if char::is_numeric(c) {
            len += 1;
        } else {
            break;
        }
    }
    if len == 0 {
        return None;
    }
    if input.chars().nth(len) != Some(':') {
        return None;
    }
    let Ok(prefix) = str::parse::<i32>(&input[0..len]) else {
        return None;
    };
    return Some((prefix, &input[len + 1..]));
}

pub fn serialize_with_channel_prefix<T: Serialize>(
    channel: i32,
    msg: &T,
) -> Option<String> {
    let mut res = channel.to_string() + ":";
    match serde_json::to_writer(unsafe { res.as_mut_vec() }, &msg) {
        Ok(_) => Some(res),
        Err(_) => None,
    }
}
