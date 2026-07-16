use diesel::prelude::*;
use uuid::Uuid;

use crate::schema;

#[derive(serde::Serialize, Selectable, Queryable)]
#[diesel(table_name = schema::collections)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Collection {
    pub id: String,
    pub is_ref: bool,
    pub colrev: i64,
    pub permissions: String,
    pub storage_limit: i64,
    pub used_storage: i64,
}

impl Into<sinkron_common::types::Collection> for Collection {
    fn into(self) -> sinkron_common::types::Collection {
        let Collection {
            id,
            is_ref,
            colrev,
            permissions,
            storage_limit,
            used_storage,
        } = self;
        sinkron_common::types::Collection {
            id,
            is_ref,
            colrev,
            permissions,
            storage_limit,
            used_storage,
        }
    }
}

#[derive(serde::Deserialize, Insertable)]
#[diesel(table_name = schema::collections)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct NewCollection {
    pub id: String,
    pub is_ref: bool,
    pub permissions: String,
    pub storage_limit: i64,
}

#[derive(serde::Serialize, Selectable, Queryable)]
#[diesel(table_name = schema::documents)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Document {
    pub id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub col_id: String,
    pub colrev: i64,
    pub content: Option<Vec<u8>>,
    pub files: Vec<Option<Uuid>>,
    pub is_deleted: bool,
    pub permissions: String,
}

#[derive(Insertable)]
#[diesel(table_name = schema::documents)]
pub struct NewDocument<'a> {
    pub id: Uuid,
    pub col_id: String,
    pub colrev: i64,
    pub content: Vec<u8>,
    pub files: Vec<Option<Uuid>>,
    pub permissions: &'a str,
}

#[derive(AsChangeset)]
#[diesel(table_name = schema::documents)]
pub struct DocumentUpdate<'a> {
    pub colrev: i64,
    pub is_deleted: bool,
    // None - update is skipped, Some(None) - inserts NULL
    pub content: Option<Option<&'a Vec<u8>>>,
    pub files: Option<&'a Vec<Uuid>>,
}

#[derive(serde::Serialize, Selectable, Queryable)]
#[diesel(table_name = schema::refs)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Ref {
    pub id: Uuid,
    pub doc_id: Uuid,
    pub col_id: String,
}

#[derive(serde::Deserialize, Insertable)]
#[diesel(table_name = schema::refs)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct NewRef {
    pub doc_id: Uuid,
    pub col_id: String,
}

#[derive(Insertable)]
#[diesel(table_name = schema::groups)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Group {
    pub id: String,
}

#[derive(Insertable)]
#[diesel(table_name = schema::members)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Member {
    pub user: String,
    pub group: String,
}

#[derive(serde::Serialize, Selectable, Queryable)]
#[diesel(table_name = schema::file_uploads)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct FileUpload {
    pub id: Uuid,
    pub file_id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub col_id: String,
    pub size: i64,
    pub checksum: String,
}

#[derive(Insertable)]
#[diesel(table_name = schema::file_uploads)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct NewFileUpload {
    pub id: Uuid,
    pub file_id: Uuid,
    pub col_id: String,
    pub size: i64,
    pub checksum: String,
}

#[derive(serde::Serialize, Selectable, Queryable)]
#[diesel(table_name = schema::files)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct File {
    pub id: Uuid,
    pub col_id: String,
    pub doc_id: Uuid,
    pub size: i64,
    pub checksum: String,
}

#[derive(Insertable)]
#[diesel(table_name = schema::files)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct NewFile {
    pub id: Uuid,
    pub col_id: String,
    pub doc_id: Uuid,
    pub size: i64,
    pub checksum: String,
}
