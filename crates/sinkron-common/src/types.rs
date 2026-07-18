use serde::{Deserialize, Serialize};

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
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub is_ref: bool,
    pub colrev: i64,
    pub permissions: String,
    pub storage_limit: i64,
    pub used_storage: i64,
}

#[derive(Serialize)]
pub struct Group {
    pub id: String,
    pub members: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct User {
    pub id: String,
    pub groups: Vec<String>,
}
