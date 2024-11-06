use diesel::prelude::*;

use crate::schema;

#[derive(serde::Serialize, Selectable, Queryable)]
#[diesel(table_name = schema::collections)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Collection {
    pub id: String,
    pub is_ref: bool,
    pub colrev: i64,
    pub permissions: String,
}

#[derive(serde::Deserialize, Insertable)]
#[diesel(table_name = schema::collections)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct NewCollection {
    pub id: String,
    pub is_ref: bool,
    pub permissions: String,
}

#[derive(serde::Serialize, Selectable, Queryable)]
#[diesel(table_name = schema::documents)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Document {
    pub id: uuid::Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub col_id: String,
    pub colrev: i64,
    pub data: Option<Vec<u8>>,
    pub is_deleted: bool,
    pub permissions: String,
}

#[derive(Insertable)]
#[diesel(table_name = schema::documents)]
pub struct NewDocument {
    pub id: uuid::Uuid,
    pub col_id: String,
    pub colrev: i64,
    pub data: Vec<u8>,
    pub permissions: String,
}

#[derive(AsChangeset)]
#[diesel(table_name = schema::documents)]
pub struct DocumentUpdate<'a> {
    pub colrev: i64,
    pub is_deleted: bool,
    pub data: Option<&'a Vec<u8>>,
}

#[derive(serde::Serialize, Selectable, Queryable)]
#[diesel(table_name = schema::refs)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Ref {
    pub id: uuid::Uuid,
    pub doc_id: uuid::Uuid,
    pub col_id: String,
}

#[derive(serde::Deserialize, Insertable)]
#[diesel(table_name = schema::refs)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct NewRef {
    pub doc_id: uuid::Uuid,
    pub col_id: String,
}
