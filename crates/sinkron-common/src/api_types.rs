use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::protocol::FilesUpdate;

#[derive(Serialize, Deserialize)]
pub struct Id {
    pub id: String
}

#[derive(Serialize, Deserialize)]
pub struct CreateCollection {
    pub id: String,
    pub is_ref: bool,
    pub permissions: String,
    pub storage_limit: i64,
}

#[derive(Serialize, Deserialize)]
pub struct GetDocument {
    pub id: Uuid,
    pub col: String,
}

pub type DeleteDocument = GetDocument;

#[derive(Serialize, Deserialize)]
pub struct CreateDocument {
    pub id: Uuid,
    pub col: String,
    pub content: String,
    pub files: Vec<Uuid>,
    pub permissions: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct UpdateDocument {
    pub id: Uuid,
    pub col: String,
    pub content_update: Option<String>,
    pub files_update: Option<FilesUpdate>,
}
