use diesel::prelude::*;
use uuid::Uuid;

use crate::schema;

#[derive(serde::Serialize, Selectable, Queryable)]
#[diesel(table_name = schema::users)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct User {
    pub id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub email: String,
    pub is_disabled: bool,
    pub picture: String, // json
}

#[derive(serde::Serialize, Selectable, Queryable)]
#[diesel(table_name = schema::otps)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Otp {
    pub id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub code: String,
    pub email: String,
    pub attempts: i16,
}

#[derive(Insertable)]
#[diesel(table_name = schema::otps)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct NewOtp {
    pub id: Uuid,
    pub code: String,
    pub email: String,
}

#[derive(serde::Serialize, Selectable, Queryable)]
#[diesel(table_name = schema::auth_tokens)]
#[diesel(check_for_backend(diesel::pg::Pg))]
#[diesel(belongs_to(User))]
pub struct AuthToken {
    pub token: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_access: chrono::DateTime<chrono::Utc>,
    pub client_string: String,
    pub user_id: Uuid,
}
