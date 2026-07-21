use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::protocol::FilesUpdate;

// Collections

#[derive(Serialize, Deserialize)]
pub struct Id {
    pub id: String
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub is_ref: bool,
    pub colrev: i64,
    pub permissions: String,
    pub storage_limit: i64,
    pub used_storage: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCollection {
    pub id: String,
    pub is_ref: bool,
    pub permissions: String,
    pub storage_limit: i64,
}

// Documents

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: uuid::Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub content: Option<String>,
    pub col: String,
    pub colrev: i64,
    pub permissions: String,
}

#[derive(Serialize, Deserialize)]
pub struct CreateDocument {
    pub id: Uuid,
    pub col: String,
    pub content: String,
    pub files: Vec<Uuid>,
    pub permissions: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct GetDocument {
    pub id: Uuid,
    pub col: String,
}

pub type DeleteDocument = GetDocument;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocument {
    pub id: Uuid,
    pub col: String,
    pub content_update: Option<String>,
    pub files_update: Option<FilesUpdate>,
}

// Users & groups

#[derive(Serialize, Deserialize)]
pub struct AddRemoveUserToGroup {
    pub user: String,
    pub group: String,
}

#[derive(Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub members: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct User {
    pub id: String,
    pub groups: Vec<String>,
}
