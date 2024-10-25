mod models;
mod schema;

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use base64::prelude::*;
use diesel::prelude::*;
use diesel_async::{
    pooled_connection::AsyncDieselConnectionManager, AsyncPgConnection,
    RunQueryDsl,
};

// use crate::schema;
use crate::models::{Collection, NewCollection};

/// Utility function for mapping any error into a `500 Internal Server Error`
/// response.
fn internal_error<E>(err: E) -> (StatusCode, String)
where
    E: std::error::Error,
{
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

async fn root() -> &'static str {
    "Hello, World!"
}

// Collections

#[derive(serde::Deserialize)]
struct Id {
    id: String,
}

async fn create_collection(
    State(state): State<SinkronState>,
    Json(new_collection): Json<NewCollection>,
) -> Result<Json<Collection>, (StatusCode, String)> {
    let mut conn = state.connect().await?;
    let res = diesel::insert_into(schema::collections::table)
        .values(&new_collection)
        .returning(Collection::as_returning())
        .get_result(&mut conn)
        .await
        .map_err(internal_error)?;
    Ok(Json(res))
}

async fn get_collection(
    State(state): State<SinkronState>,
    Json(id): Json<Id>,
) -> Result<Json<Collection>, (StatusCode, String)> {
    let mut conn = state.connect().await?;
    let res = schema::collections::table
        .find(id.id)
        .first(&mut conn)
        .await;
    match res {
        Ok(col) => Ok(Json(col)),
        Err(diesel::NotFound) => {
            Err((StatusCode::NOT_FOUND, "Collection not found".to_string()))
        }
        Err(err) => Err((StatusCode::INTERNAL_SERVER_ERROR, err.to_string())),
    }
}

async fn delete_collection(
    State(state): State<SinkronState>,
    Json(id): Json<Id>,
) -> Result<(), (StatusCode, String)> {
    let mut conn = state.connect().await?;

    // if ref - delete refs
    // if doc - delete documents

    let num = diesel::delete(schema::collections::table.find(id.id))
        .execute(&mut conn)
        .await
        .map_err(internal_error)?;

    if num == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            "Collection not found".to_string(),
        ));
    }

    Ok(())
}

// Documents

#[derive(serde::Deserialize)]
struct CreateDocumentPayload {
    id: uuid::Uuid,
    data: String,
    col: String,
    permissions: Option<String>,
}

#[derive(serde::Serialize)]
struct DocumentView {
    id: uuid::Uuid,
    created_at: String,
    updated_at: String,
    data: String,
    col: String,
    colrev: i64,
    permissions: String,
}

async fn create_document(
    State(state): State<SinkronState>,
    Json(payload): Json<CreateDocumentPayload>,
) -> Result<Json<DocumentView>, (StatusCode, String)> {
    use schema::collections;

    let mut conn = state.connect().await?;

    // TODO check for duplicate doc id ?

    let is_ref = collections::table
        .select(collections::is_ref)
        .find(&payload.col)
        .first(&mut conn)
        .await
        .map_err(|err| match err {
            diesel::NotFound => {
                (StatusCode::NOT_FOUND, "Collection not found".to_string())
            }
            err => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
        })?;

    if is_ref {
        return Err((
            StatusCode::NOT_FOUND,
            "Creating documents is not supported in ref collections"
                .to_string(),
        ));
    }

    let data = BASE64_STANDARD.decode(&payload.data).map_err(|_| {
        (
            StatusCode::NOT_FOUND,
            "Couldn't decode data as base64".to_string(),
        )
    })?;

    // increment colrev
    let colrev: i64 = diesel::update(collections::table)
        .filter(collections::id.eq(&payload.col))
        .set(collections::colrev.eq(collections::colrev + 1))
        .returning(collections::colrev)
        .get_result(&mut conn)
        .await
        .map_err(internal_error)?;

    // create document
    let new_doc = models::NewDocument {
        id: payload.id,
        col_id: payload.col.clone(),
        colrev,
        data,
        permissions: "".to_string(), // TODO
    };

    let created_at: chrono::DateTime<chrono::Utc> =
        diesel::insert_into(schema::documents::table)
            .values(&new_doc)
            .returning(schema::documents::created_at)
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;

    let created_at_str = created_at.format("%+").to_string();

    let view = DocumentView {
        id: payload.id,
        created_at: created_at_str.clone(),
        updated_at: created_at_str,
        data: payload.data,
        col: payload.col,
        colrev,
        permissions: "".to_string(),
    };

    // TODO send messages to subscribers

    Ok(Json(view))
}

async fn get_document(
    State(state): State<SinkronState>,
) -> Result<String, (StatusCode, String)> {
    let mut conn = state.connect().await?;

    Ok("2".to_string())
}

// { id, changes/data? }
async fn update_document() -> &'static str {
    "Hello, World!"
}

// { id }
async fn delete_document() -> &'static str {
    "Hello, World!"
}

// Refs

#[derive(serde::Deserialize)]
struct AddRemoveDocumentPayload {
    id: uuid::Uuid,
    col: String,
}

async fn add_document_to_collection(
    State(state): State<SinkronState>,
    Json(payload): Json<AddRemoveDocumentPayload>,
) -> Result<(), (StatusCode, String)> {
    let mut conn = state.connect().await?;

    // select is_ref, colrev
    let num = schema::collections::table
        .count()
        .execute(&mut conn)
        .await
        .map_err(internal_error)?;

    let new_ref = models::NewRef {
        doc_id: payload.id,
        col_id: payload.col,
    };

    diesel::insert_into(schema::refs::table)
        .values(&new_ref)
        .execute(&mut conn)
        .await
        .map_err(internal_error)?;

    // TODO update colrev
    // TODO send messages

    Ok(())
}

async fn remove_document_from_collection() -> &'static str {
    "Hello, World!"
}
async fn create_group() -> &'static str {
    "Hello, World!"
}
async fn delete_group() -> &'static str {
    "Hello, World!"
}
async fn add_user_to_group() -> &'static str {
    "Hello, World!"
}
async fn remove_user_from_group() -> &'static str {
    "Hello, World!"
}
async fn delete_user() -> &'static str {
    "Hello, World!"
}
async fn check_collection_permissions() -> &'static str {
    "Hello, World!"
}
async fn update_collection_permissions() -> &'static str {
    "Hello, World!"
}
async fn check_document_permissions() -> &'static str {
    "Hello, World!"
}
async fn update_document_permissions() -> &'static str {
    "Hello, World!"
}

struct DbConfig {
    host: String,
    port: i32,
    user: String,
    password: String,
    database: String,
}

#[derive(Clone)]
struct SinkronState {
    pool: bb8::Pool<
        AsyncDieselConnectionManager<diesel_async::AsyncPgConnection>,
    >,
}

type DbConnection = bb8::PooledConnection<
    'static,
    AsyncDieselConnectionManager<AsyncPgConnection>,
>;

type InternalError = (StatusCode, String);

impl SinkronState {
    async fn connect(&self) -> Result<DbConnection, InternalError> {
        self.pool.get_owned().await.map_err(internal_error)
    }
}

async fn start(config: DbConfig) {
    let config_string = format!(
        "host={} port={} user={} password={} dbname={}",
        config.host, config.port, config.user, config.password, config.database,
    );

    let manager =
        AsyncDieselConnectionManager::<diesel_async::AsyncPgConnection>::new(
            config_string,
        );
    let pool = bb8::Pool::builder().build(manager).await.unwrap();

    let state = SinkronState { pool };

    let app = Router::new()
        .route("/", get(root))
        // Documents
        .route("/get_document", post(get_document))
        .route("/create_document", post(create_document))
        .route("/update_document", post(update_document))
        .route("/delete_document", post(delete_document))
        // Collections
        .route("/get_collection", post(get_collection))
        .route("/create_collection", post(create_collection))
        .route("/delete_collection", post(delete_collection))
        // Refs
        .route(
            "/add_document_to_collection",
            post(add_document_to_collection),
        )
        .route(
            "/remove_document_from_collection",
            post(remove_document_from_collection),
        )
        // Groups
        .route("/create_group", post(create_group))
        .route("/delete_group", post(delete_group))
        .route("/add_user_to_group", post(add_user_to_group))
        .route("/remove_user_from_group", post(remove_user_from_group))
        .route("/delete_user", post(delete_user))
        // Permissions
        .route(
            "/check_collection_permissions",
            post(check_collection_permissions),
        )
        .route(
            "/update_collection_permissions",
            post(update_collection_permissions),
        )
        .route(
            "/check_document_permissions",
            post(check_document_permissions),
        )
        .route(
            "/update_document_permissions",
            post(update_document_permissions),
        )
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
    println!("Starting server at port 3000");
}

/*
ws
    connect + sync ?
    close

    -> sync ?
        <- sync_start / sync_error
        <- doc
        <- sync_complete

    -> h
        <- h

    -> change
        <- change
        <- change_error

    -> get
        <- doc
        <- get_error ?
*/

#[tokio::main]
async fn main() {
    let config = DbConfig {
        host: "localhost".to_string(),
        port: 5432,
        database: "sinkron_rs".to_string(),
        user: "sinkron".to_string(),
        password: "password".to_string(),
    };
    start(config).await;
}

/*
// Group

struct CreateGroup {
    id: string,
}

struct DeleteGroup {
    id: string,
}

struct AddUserToGroup {
    group: string,
    user: string,
}

struct RemoveUserFromGroup {
    group: string,
    user: string,
}

struct DeleteUser {
    id: string,
}

// Permissions

enum Role {
    Any,
    Group(string),
    User(string),
}

enum CollectionAction {
    Create,
    Read,
    Add,
    Remove,
}

enum DocumentAction {
    Read,
    Update,
    Delete,
}

struct CollectionPermissions {}

struct DocumentPermissions {}

struct SetCollectionPermissions {
    id: string,
    permissions: CollectionPermissions,
    doc_permissions: DocumentPermissions,
}

struct CheckCollectionPermissions {
    id: string,
    action: CollecionAction,
}

struct SetDocumentPermissions {
    id: string,
    permissions: DocumentPermissions,
}

struct CheckDocumentPermissions {
    id: string,
    action: DocumentAction,
}
*/
