use crate::models;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: uuid::Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub data: Option<String>,
    pub col: String,
    pub colrev: i64,
    pub permissions: String,
}

pub type Collection = models::Collection;

#[derive(serde::Serialize)]
pub struct Group {
    pub id: String,
    pub members: Vec<String>
}

#[derive(serde::Serialize, Clone)]
pub struct User {
    pub id: String,
    pub groups: Vec<String>
}
