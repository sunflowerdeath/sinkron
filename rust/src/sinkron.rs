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

use crate::error::{SinkronError, internal_error};
use crate::db;
use crate::models;
use crate::protocol::*;
use crate::schema;
use crate::actors::sinkron::{SinkronHandle, SinkronActorMessage};
use crate::actors::collection::{CollectionHandle, CollectionMessage};
use crate::api_types::{Collection, Document};

type CreateCollection = models::NewCollection;

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
        // TODO check if collection exists
        let col = self.get_collection_actor(col).await?;

        let (sender, receiver) = oneshot::channel();
        col.send(CollectionMessage::Get { id, reply: sender });
        receiver.await.map_err(internal_error)?
    }

    async fn create_document(
        &self,
        id: uuid::Uuid,
        col: String,
        data: String,
    ) -> Result<Document, SinkronError> {
        // TODO check if collection exists
        let col = self.get_collection_actor(col).await?;

        let (sender, receiver) = oneshot::channel();
        col.send(CollectionMessage::Create {
            id,
            data,
            reply: sender,
        });
        receiver.await.map_err(internal_error)?
    }

    async fn update_document(
        &self,
        id: uuid::Uuid,
        col: String,
        data: String,
    ) -> Result<Document, SinkronError> {
        // TODO check if collection exists
        let col = self.get_collection_actor(col).await?;

        let (sender, receiver) = oneshot::channel();
        col.send(CollectionMessage::Update {
            id,
            data,
            reply: sender,
        });
        receiver.await.map_err(internal_error)?
    }

    async fn delete_document(
        &self,
        id: uuid::Uuid,
        col: String,
    ) -> Result<Document, SinkronError> {
        // TODO check if collection exists
        let col = self.get_collection_actor(col).await?;

        let (sender, receiver) = oneshot::channel();
        col.send(CollectionMessage::Delete { id, reply: sender });
        receiver.await.map_err(internal_error)?
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
            /*
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
            */
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
    let CreateDocument {
        id,
        col,
        data,
        permissions,
    } = payload;
    let res = state.create_document(id, col, data).await;
    sinkron_response(res)
}

async fn update_document(
    State(state): State<Sinkron>,
    Json(payload): Json<UpdateDocument>,
) -> Response {
    let UpdateDocument { id, col, data } = payload;
    let res = state.update_document(id, col, data).await;
    sinkron_response(res)
}

async fn delete_document(
    State(state): State<Sinkron>,
    Json(payload): Json<DeleteDocument>,
) -> Response {
    let res = state.delete_document(payload.id, payload.col).await;
    sinkron_response(res)
}
