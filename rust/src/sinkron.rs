use axum::{
    extract::ws::{WebSocket, WebSocketUpgrade},
    extract::{Query, Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{any, get, post},
    Json, Router,
};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use serde;
use tokio::sync::oneshot;

use crate::actors::collection;
use crate::actors::collection::{CollectionHandle, CollectionMessage};
use crate::actors::sinkron::{SinkronActorMessage, SinkronHandle};
use crate::api_types::{Collection, Document, Group, User};
use crate::db;
use crate::error::{internal_error, SinkronError};
use crate::models;
use crate::protocol::*;
use crate::schema;

type CreateCollection = models::NewCollection;

#[derive(serde::Deserialize)]
struct UpdateCollectionPermissions {
    id: String,
    permissions: String,
}

#[derive(serde::Deserialize)]
struct UpdateDocumentPermissions {
    id: uuid::Uuid,
    col: String,
    permissions: String,
}

fn default_host() -> String {
    "0.0.0.0".to_string()
}
fn default_port() -> u32 {
    3000
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SinkronConfig {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u32,
    pub api_token: String,
    pub db: db::DbConfig,
}

#[derive(Clone)]
pub struct Sinkron {
    pool: db::DbConnectionPool,
    actor: SinkronHandle,
    host: String,
    port: u32,
    api_token: String,
}

impl Sinkron {
    pub async fn new(config: SinkronConfig) -> Self {
        let pool = db::create_pool(config.db).await;
        let actor = SinkronHandle::new(pool.clone());
        Self {
            pool,
            actor,
            host: config.host,
            port: config.port,
            api_token: config.api_token,
        }
    }

    async fn connect(&self) -> Result<db::DbConnection, SinkronError> {
        self.pool.get().await.map_err(internal_error)
    }

    async fn get_collection_actor(
        &self,
        col: String,
    ) -> Result<CollectionHandle, SinkronError> {
        let (sender, receiver) = oneshot::channel();
        self.actor
            .send(SinkronActorMessage::GetCollection { col, reply: sender });
        receiver.await.map_err(internal_error)?
    }

    // Collections

    async fn create_collection(
        &self,
        props: CreateCollection,
    ) -> Result<Collection, SinkronError> {
        let mut conn = self.connect().await?;
        let cnt: i64 = schema::collections::table
            .filter(schema::collections::id.eq(&props.id))
            .count()
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;
        if cnt != 0 {
            return Err(SinkronError::unprocessable("Duplicate collection id"));
        }
        let col = diesel::insert_into(schema::collections::table)
            .values(&props)
            .returning(models::Collection::as_returning())
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;
        Ok(col)
    }

    async fn get_collection(
        &self,
        id: String,
    ) -> Result<models::Collection, SinkronError> {
        let mut conn = self.connect().await?;
        schema::collections::table
            .find(id)
            .first(&mut conn)
            .await
            .map_err(|err| match err {
                diesel::NotFound => {
                    SinkronError::not_found("Collection not found")
                }
                err => SinkronError::internal(&err.to_string()),
            })
    }

    // Documents

    async fn get_document(
        &self,
        id: uuid::Uuid,
        col: String,
    ) -> Result<Document, SinkronError> {
        let col = self.get_collection_actor(col).await?;

        let (sender, receiver) = oneshot::channel();
        col.send(CollectionMessage::Get(collection::GetMessage {
            id,
            source: collection::Source::Api,
            reply: sender,
        }))
        .map_err(internal_error)?;
        receiver.await.map_err(internal_error)?
    }

    async fn create_document(
        &self,
        props: CreateDocument,
    ) -> Result<Document, SinkronError> {
        let CreateDocument {
            id,
            col,
            data,
            permissions,
        } = props;

        let col = self.get_collection_actor(col).await?;

        let (sender, receiver) = oneshot::channel();
        col.send(CollectionMessage::Create(collection::CreateMessage {
            id,
            data,
            source: collection::Source::Api,
            reply: sender,
        }))
        .map_err(internal_error)?;
        receiver.await.map_err(internal_error)?
    }

    async fn update_document(
        &self,
        props: UpdateDocument,
    ) -> Result<Document, SinkronError> {
        let UpdateDocument { id, col, data } = props;

        let col = self.get_collection_actor(col).await?;

        let (sender, receiver) = oneshot::channel();
        col.send(CollectionMessage::Update(collection::UpdateMessage {
            id,
            data,
            source: collection::Source::Api,
            reply: sender,
        }))
        .map_err(internal_error)?;
        receiver.await.map_err(internal_error)?
    }

    async fn delete_document(
        &self,
        id: uuid::Uuid,
        col: String,
    ) -> Result<Document, SinkronError> {
        let col = self.get_collection_actor(col).await?;

        let (sender, receiver) = oneshot::channel();
        col.send(CollectionMessage::Delete(collection::DeleteMessage {
            id,
            source: collection::Source::Api,
            reply: sender,
        }))
        .map_err(internal_error)?;
        receiver.await.map_err(internal_error)?
    }

    // Groups

    async fn group_exists(
        &self,
        conn: &mut db::DbConnection,
        id: &str,
    ) -> Result<bool, SinkronError> {
        let cnt: i64 = schema::groups::table
            .filter(schema::groups::id.eq(&id))
            .count()
            .get_result(conn)
            .await
            .map_err(internal_error)?;
        Ok(cnt != 0)
    }

    async fn get_user(&self, id: String) -> Result<User, SinkronError> {
        let mut conn = self.connect().await?;
        let groups: Vec<String> = schema::members::table
            .filter(schema::members::user.eq(&id))
            .select(schema::members::group)
            .get_results(&mut conn)
            .await
            .map_err(internal_error)?;
        Ok(User { id, groups })
    }

    async fn get_group(&self, id: String) -> Result<Group, SinkronError> {
        let mut conn = self.connect().await?;
        let exists = self.group_exists(&mut conn, &id).await?;
        if !exists {
            return Err(SinkronError::not_found("Group not found"));
        }
        let members: Vec<String> = schema::members::table
            .filter(schema::members::group.eq(&id))
            .select(schema::members::user)
            .get_results(&mut conn)
            .await
            .map_err(internal_error)?;
        Ok(Group { id, members })
    }

    async fn create_group(&self, id: String) -> Result<(), SinkronError> {
        let mut conn = self.connect().await?;
        let new_group = models::Group { id };
        let _ = diesel::insert_into(schema::groups::table)
            .values(&new_group)
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        Ok(())
    }

    async fn delete_group(&self, id: String) -> Result<(), SinkronError> {
        let mut conn = self.connect().await?;
        let _ = diesel::delete(schema::members::table)
            .filter(schema::members::group.eq(&id))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        let num = diesel::delete(schema::groups::table)
            .filter(schema::groups::id.eq(&id))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        if num == 0 {
            Err(SinkronError::not_found("Group not found"))
        } else {
            Ok(())
        }
    }

    async fn add_user_to_group(
        &self,
        props: AddRemoveUserToGroup,
    ) -> Result<(), SinkronError> {
        let AddRemoveUserToGroup { user, group } = props;
        let mut conn = self.connect().await?;
        let exists = self.group_exists(&mut conn, &group).await?;
        if !exists {
            return Err(SinkronError::not_found("Group not found"));
        }
        let new_member = models::Member { user, group };
        let _ = diesel::insert_into(schema::members::table)
            .values(&new_member)
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        Ok(())
    }

    async fn remove_user_from_group(
        &self,
        props: AddRemoveUserToGroup,
    ) -> Result<(), SinkronError> {
        let AddRemoveUserToGroup { user, group } = props;
        let mut conn = self.connect().await?;
        let num = diesel::delete(schema::members::table)
            .filter(schema::members::user.eq(&user))
            .filter(schema::members::group.eq(&group))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        if num == 0 {
            Err(SinkronError::not_found("Group member not found"))
        } else {
            Ok(())
        }
    }

    async fn remove_user_from_all_groups(
        &self,
        id: String,
    ) -> Result<(), SinkronError> {
        let mut conn = self.connect().await?;
        let _ = diesel::delete(schema::members::table)
            .filter(schema::members::user.eq(&id))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        Ok(())
    }

    // Permissions

    async fn update_collection_permissions(
        &self,
        props: UpdateCollectionPermissions,
    ) -> Result<(), SinkronError> {
        let mut conn = self.connect().await?;
        let num: usize = diesel::update(schema::collections::table)
            .filter(schema::collections::id.eq(&props.id))
            .set(schema::collections::permissions.eq(props.permissions))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        if num == 0 {
            Err(SinkronError::not_found("Collection not found"))
        } else {
            Ok(())
        }
    }

    async fn update_document_permissions(
        &self,
        props: UpdateDocumentPermissions,
    ) -> Result<(), SinkronError> {
        let mut conn = self.connect().await?;
        let num: usize = diesel::update(schema::documents::table)
            .filter(schema::documents::id.eq(&props.id))
            .filter(schema::documents::col_id.eq(&props.col))
            .set(schema::documents::permissions.eq(props.permissions))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        if num == 0 {
            Err(SinkronError::not_found("Document not found"))
        } else {
            Ok(())
        }
    }

    fn app(&self) -> Router {
        let api_router = Router::new()
            .route("/get_document", post(get_document))
            .route("/create_document", post(create_document))
            .route("/update_document", post(update_document))
            .route("/delete_document", post(delete_document))
            // Collections
            .route("/create_collection", post(create_collection))
            .route("/get_collection", post(get_collection))
            // .route("/delete_collection", post(delete_collection))
            /*
            // Refs
            .route(
                "/add_document_to_collection",
                post(add_document_to_collection),
            )
            .route(
                "/remove_document_from_collection",
                post(remove_document_from_collection),
            )
            */
            // Groups & users
            .route("/get_user", post(get_user))
            .route("/get_group", post(get_group))
            .route("/create_group", post(create_group))
            .route("/delete_group", post(delete_group))
            .route("/add_user_to_group", post(add_user_to_group))
            .route("/remove_user_from_group", post(remove_user_from_group))
            .route(
                "/remove_user_from_all_groups",
                post(remove_user_from_all_groups),
            )
            // Permissions
            .route(
                "/update_collection_permissions",
                post(update_collection_permissions),
            )
            .route(
                "/update_document_permissions",
                post(update_document_permissions),
            )
            .layer(middleware::from_fn_with_state(
                self.clone(),
                check_auth_token,
            ))
            .with_state(self.clone());

        Router::new()
            .route("/", get(root))
            .route("/sync", any(sync_handler))
            .merge(api_router)
            .with_state(self.clone())
    }

    pub async fn run(&self) {
        let conn = self.connect().await.unwrap();
        db::run_migrations(deadpool::managed::Object::take(conn))
            .await
            .unwrap();

        let app = self.app();
        let host = format!("{}:{}", self.host, self.port);
        let listener = tokio::net::TcpListener::bind(host).await.unwrap();
        axum::serve(listener, app).await.unwrap();
    }
}

async fn root() -> &'static str {
    "Sinkron api"
}

// Websocket handler

#[derive(serde::Deserialize)]
struct SyncQuery {
    col: String,
    colrev: i64,
}

async fn sync_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<SyncQuery>,
    State(sinkron): State<Sinkron>,
) -> Response {
    ws.on_upgrade(move |ws| handle_connect(sinkron, ws, query))
}

async fn handle_connect(
    sinkron: Sinkron,
    websocket: WebSocket,
    query: SyncQuery,
) {
    _ = sinkron.actor.send(SinkronActorMessage::Connect {
        websocket,
        col: query.col,
        colrev: query.colrev,
    });
}

// Api auth middleware

fn get_header_value(req: &Request, header: &str) -> Option<String> {
    let Some(header_value) = req.headers().get(header) else {
        return None;
    };
    if let Ok(str) = header_value.to_str() {
        Some(str.to_string())
    } else {
        None
    }
}

async fn check_auth_token(
    State(state): State<Sinkron>,
    req: Request,
    next: Next,
) -> Response {
    let header = get_header_value(&req, "x-sinkron-api-token");
    if Some(state.api_token) == header {
        next.run(req).await
    } else {
        sinkron_err_response(SinkronError::auth_failed(
            "Invalid authorization token",
        ))
    }
}

// Api response helpers

#[derive(serde::Serialize)]
struct SinkronErrorBody {
    error: SinkronError,
}

fn sinkron_err_response(error: SinkronError) -> Response {
    let status = match error.code {
        ErrorCode::BadRequest => StatusCode::BAD_REQUEST,
        ErrorCode::AuthFailed => StatusCode::UNAUTHORIZED,
        ErrorCode::NotFound => StatusCode::NOT_FOUND,
        ErrorCode::Forbidden => StatusCode::FORBIDDEN,
        ErrorCode::UnprocessableContent => StatusCode::UNPROCESSABLE_ENTITY,
        ErrorCode::InternalServerError => StatusCode::INTERNAL_SERVER_ERROR,
    };
    let body = Json(SinkronErrorBody { error });
    (status, body).into_response()
}

fn sinkron_response<T>(result: Result<T, SinkronError>) -> Response
where
    T: serde::Serialize,
{
    match result {
        Ok(res) => Json(res).into_response(),
        Err(err) => sinkron_err_response(err),
    }
}

// Collection handlers

#[derive(serde::Deserialize)]
struct Id {
    id: String,
}

async fn create_collection(
    State(state): State<Sinkron>,
    Json(payload): Json<CreateCollection>,
) -> Response {
    let res = state.create_collection(payload).await;
    sinkron_response(res)
}

async fn get_collection(
    State(state): State<Sinkron>,
    Json(id): Json<Id>,
) -> Response {
    let res = state.get_collection(id.id).await;
    sinkron_response(res)
}

// Document handlers

#[derive(serde::Deserialize)]
struct GetDocument {
    id: uuid::Uuid,
    col: String,
}

type DeleteDocument = GetDocument;

#[derive(serde::Deserialize)]
struct CreateDocument {
    id: uuid::Uuid,
    col: String,
    data: String,
    permissions: Option<String>,
}

#[derive(serde::Deserialize)]
struct UpdateDocument {
    id: uuid::Uuid,
    col: String,
    data: String,
}

async fn get_document(
    State(state): State<Sinkron>,
    Json(payload): Json<GetDocument>,
) -> Response {
    let res = state.get_document(payload.id, payload.col).await;
    sinkron_response(res)
}

async fn create_document(
    State(state): State<Sinkron>,
    Json(payload): Json<CreateDocument>,
) -> Response {
    let res = state.create_document(payload).await;
    sinkron_response(res)
}

async fn update_document(
    State(state): State<Sinkron>,
    Json(payload): Json<UpdateDocument>,
) -> Response {
    let res = state.update_document(payload).await;
    sinkron_response(res)
}

async fn delete_document(
    State(state): State<Sinkron>,
    Json(payload): Json<DeleteDocument>,
) -> Response {
    let res = state.delete_document(payload.id, payload.col).await;
    sinkron_response(res)
}

// Groups handlers

#[derive(serde::Deserialize)]
struct AddRemoveUserToGroup {
    user: String,
    group: String,
}

async fn create_group(
    State(sinkron): State<Sinkron>,
    Json(payload): Json<Id>,
) -> Response {
    let res = sinkron.create_group(payload.id).await;
    sinkron_response(res)
}

async fn get_group(
    State(sinkron): State<Sinkron>,
    Json(payload): Json<Id>,
) -> Response {
    let res = sinkron.get_group(payload.id).await;
    sinkron_response(res)
}

async fn get_user(
    State(sinkron): State<Sinkron>,
    Json(payload): Json<Id>,
) -> Response {
    let res = sinkron.get_user(payload.id).await;
    sinkron_response(res)
}

async fn delete_group(
    State(sinkron): State<Sinkron>,
    Json(payload): Json<Id>,
) -> Response {
    let res = sinkron.delete_group(payload.id).await;
    sinkron_response(res)
}

async fn add_user_to_group(
    State(sinkron): State<Sinkron>,
    Json(payload): Json<AddRemoveUserToGroup>,
) -> Response {
    let res = sinkron.add_user_to_group(payload).await;
    sinkron_response(res)
}

async fn remove_user_from_group(
    State(sinkron): State<Sinkron>,
    Json(payload): Json<AddRemoveUserToGroup>,
) -> Response {
    let res = sinkron.remove_user_from_group(payload).await;
    sinkron_response(res)
}

async fn remove_user_from_all_groups(
    State(sinkron): State<Sinkron>,
    Json(payload): Json<Id>,
) -> Response {
    let res = sinkron.remove_user_from_all_groups(payload.id).await;
    sinkron_response(res)
}

// Permissions handlers

async fn update_collection_permissions(
    State(sinkron): State<Sinkron>,
    Json(payload): Json<UpdateCollectionPermissions>,
) -> Response {
    let res = sinkron.update_collection_permissions(payload).await;
    sinkron_response(res)
}

async fn update_document_permissions(
    State(sinkron): State<Sinkron>,
    Json(payload): Json<UpdateDocumentPermissions>,
) -> Response {
    let res = sinkron.update_document_permissions(payload).await;
    sinkron_response(res)
}
