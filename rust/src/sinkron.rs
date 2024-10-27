use crate::{models, protocol::*, schema};

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    http::StatusCode,
    response::Response,
    routing::{any, get, post},
    Json, Router,
};
use base64::prelude::*;
use diesel::prelude::*;
use diesel_async::{
    pooled_connection::AsyncDieselConnectionManager, AsyncPgConnection,
    RunQueryDsl,
};
use futures_util::{
    sink::SinkExt,
    stream::{SplitSink, StreamExt},
};
use loro;
use tokio::sync::{Mutex, RwLock};

#[derive(serde::Deserialize)]
struct Id {
    id: String,
}

#[derive(serde::Deserialize)]
struct Uuid {
    id: uuid::Uuid,
}

type Collection = models::Collection;

type CreateCollection = models::NewCollection;

#[derive(serde::Serialize)]
struct Document {
    id: uuid::Uuid,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    data: Option<String>,
    col: String,
    colrev: i64,
    permissions: String,
}

#[derive(serde::Deserialize)]
struct CreateDocument {
    id: uuid::Uuid,
    data: String,
    col: String,
    permissions: Option<String>,
}

#[derive(serde::Deserialize)]
struct UpdateDocument {
    id: uuid::Uuid,
    update: String,
    // col: String,
}

#[derive(serde::Deserialize)]
struct AddRemoveDocument {
    id: uuid::Uuid,
    col: String,
}

struct ClientState {
    user: String,
    token: bool,
    subscriptions: HashSet<String>,
    sender: Mutex<SplitSink<WebSocket, Message>>,
}

struct CollectionState {
    // id: String,
    // lock: tokio::sync::Mutex<()>,
    subscribers: HashSet<i32>,
}

struct SinkronState {
    idx: i32,
    clients: HashMap<i32, ClientState>,
    collections: HashMap<String, CollectionState>,
}

impl SinkronState {
    fn new() -> Self {
        SinkronState {
            idx: 0,
            clients: HashMap::new(),
            collections: HashMap::new(),
        }
    }
}

type SinkronError = (ErrorCode, String);

/// Utility function for mapping any error into an Internal Server Error
fn internal_error<E>(err: E) -> SinkronError
where
    E: std::error::Error,
{
    (ErrorCode::InternalServerError, err.to_string())
}

type DbConnection = bb8::PooledConnection<
    'static,
    AsyncDieselConnectionManager<AsyncPgConnection>,
>;

#[derive(Clone)]
pub struct Sinkron {
    pool: bb8::Pool<
        AsyncDieselConnectionManager<diesel_async::AsyncPgConnection>,
    >,
    state: Arc<RwLock<SinkronState>>,
}

pub struct DbConfig {
    pub host: String,
    pub port: i32,
    pub user: String,
    pub password: String,
    pub database: String,
}

impl Sinkron {
    pub async fn new(config: DbConfig) -> Self {
        let config_string = format!(
            "host={} port={} user={} password={} dbname={}",
            config.host,
            config.port,
            config.user,
            config.password,
            config.database,
        );
        let manager = AsyncDieselConnectionManager::<
            diesel_async::AsyncPgConnection,
        >::new(config_string);
        let pool = bb8::Pool::builder().build(manager).await.unwrap();

        Sinkron {
            pool,
            state: Arc::new(RwLock::new(SinkronState::new())),
        }
    }

    async fn connect(&self) -> Result<DbConnection, SinkronError> {
        self.pool.get_owned().await.map_err(internal_error)
    }

    pub async fn handle_connect(&self, socket: WebSocket) {
        let (sender, mut receiver) = socket.split();

        // auth

        // create client and store in the state
        let client_id = {
            let mut state = self.state.write().await;

            state.idx += 1;
            let idx = state.idx;

            let client = ClientState {
                user: "".to_string(),
                token: true,
                subscriptions: HashSet::new(),
                sender: Mutex::new(sender),
            };
            state.clients.insert(idx, client);

            let col = "".to_string();
            if let Some(item) = state.collections.get_mut(&col) {
                item.subscribers.insert(idx);
            } else {
                state.collections.insert(
                    col,
                    CollectionState {
                        subscribers: HashSet::from([idx]),
                    },
                );
            }

            idx
        };

        // sync collection
        // options
        //      1) lock collection while sync not completed
        //              updates will not be allowed while someone syncs
        //      2) lock client while sync not completed ?

        loop {
            if let Some(Ok(msg)) = receiver.next().await {
                let res = self.handle_message(client_id, msg).await;
                if res.is_err() {
                    println!("Error handling message");
                }
            } else {
                self.handle_disconnect(client_id).await;
                break;
            }
        }
    }

    async fn handle_disconnect(&self, client_id: i32) {
        let mut state = self.state.write().await;
        if let Some(client_state) = state.clients.remove(&client_id) {
            for col in client_state.subscriptions {
                if let Some(col_state) = state.collections.get_mut(&col) {
                    col_state.subscribers.remove(&client_id);
                }
            }
        }
    }

    async fn send_message_raw(&self, client_id: i32, msg: Message) {
        let state = self.state.read().await;
        if let Some(client) = state.clients.get(&client_id) {
            let res = {
                let mut sender = client.sender.lock().await;
                sender.send(msg).await
            };
            if res.is_err() {
                self.handle_disconnect(client_id).await;
            }
        }
    }

    async fn send_message(
        &self,
        client_id: i32,
        msg: ServerMessage,
    ) -> Result<(), SinkronError> {
        let serialized =
            Message::Text(serde_json::to_string(&msg).map_err(internal_error)?);
        self.send_message_raw(client_id, serialized).await;
        Ok(())
    }

    async fn broadcast(
        &self,
        col: String,
        msg: ServerMessage,
    ) -> Result<(), SinkronError> {
        let state = self.state.read().await;
        if let Some(col_state) = state.collections.get(&col) {
            if col_state.subscribers.len() > 0 {
                let serialized = Message::Text(
                    serde_json::to_string(&msg).map_err(internal_error)?,
                );
                for client_id in &col_state.subscribers {
                    self.send_message_raw(*client_id, serialized.clone()).await;
                }
            }
        }
        Ok(())
    }

    async fn handle_message(
        &self,
        client_id: i32,
        msg: Message,
    ) -> Result<(), SinkronError> {
        if let Message::Text(str) = msg {
            let deserialized: ClientMessage = serde_json::from_str(&str)
                .map_err(|_| {
                    (
                        ErrorCode::BadRequest,
                        "Couldn't parse message".to_string(),
                    )
                })?;
            match deserialized {
                ClientMessage::Heartbeat(msg) => {
                    self.handle_heartbeat(client_id, msg).await
                }
                ClientMessage::Get(msg) => self.handle_get(msg).await,
                ClientMessage::Change(msg) => self.handle_change(msg).await,
            }?;
        }

        Ok(())
    }

    async fn handle_heartbeat(
        &self,
        client_id: i32,
        msg: HeartbeatMessage,
    ) -> Result<(), SinkronError> {
        // ws.lastActive = process.hrtime.bigint()
        let reply = HeartbeatMessage { i: msg.i + 1 };
        self.send_message(client_id, ServerMessage::Heartbeat(reply))
            .await?;
        Ok(())
    }

    async fn handle_get(&self, msg: GetMessage) -> Result<(), SinkronError> {
        // TODO check permissions

        let res = self.get_document(msg.id).await;

        // TODO [REFS] should take into account "col",
        // - check if document is in this collection
        // - return colrev relevant to this col
        match res {
            Ok(doc) => {
                let reply = DocMessage {
                    id: doc.id,
                    col: doc.col,
                    colrev: doc.colrev,
                    data: doc.data,
                    created_at: doc.created_at,
                    updated_at: doc.updated_at,
                };
                let serialized =
                    serde_json::to_string(&reply).map_err(internal_error)?;
                self.send_message_raw(1, Message::Text(serialized)).await;
            }
            Err(err) => {
                let reply = GetErrorMessage {
                    id: msg.id,
                    code: err.0,
                };
                let serialized =
                    serde_json::to_string(&reply).map_err(internal_error)?;
                self.send_message_raw(1, Message::Text(serialized)).await;
            }
        };

        Ok(())
    }

    async fn handle_change(
        &self,
        msg: ClientChangeMessage,
    ) -> Result<(), SinkronError> {
        // TODO check permissions

        match msg.op {
            Op::Create => {
                self.create_document(CreateDocument {
                    id: msg.id,
                    data: msg.data,
                    col: msg.col,
                    permissions: None,
                })
                .await?;
                // TODO reply ChangeError
            }
            Op::Update => {
                self.update_document(msg.id, msg.data).await?;
                // TODO reply ChangeError
            }
            Op::Delete => {
                // TODO
                // self.delete_document(msg.id).await?;
            }
        };

        Ok(())
    }

    async fn create_collection(
        &self,
        props: CreateCollection,
    ) -> Result<Collection, SinkronError> {
        let mut conn = self.connect().await?;
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
                    (ErrorCode::NotFound, "Collection not found".to_string())
                }
                err => (ErrorCode::InternalServerError, err.to_string()),
            })
    }

    async fn delete_collection(&self, id: String) -> Result<(), SinkronError> {
        let mut conn = self.connect().await?;

        // if ref - delete refs
        // if doc - delete documents

        let num = diesel::delete(schema::collections::table.find(id))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;

        if num == 0 {
            return Err((
                ErrorCode::NotFound,
                "Collection not found".to_string(),
            ));
        }

        Ok(())
    }

    async fn increment_colrev(
        &self,
        col_id: &str,
    ) -> Result<i64, SinkronError> {
        let mut conn = self.connect().await?;
        use schema::collections;
        let colrev: i64 = diesel::update(collections::table)
            .filter(collections::id.eq(col_id))
            .set(collections::colrev.eq(collections::colrev + 1))
            .returning(collections::colrev)
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?; // TODO not_found ?
        Ok(colrev)
    }

    async fn create_document(
        &self,
        payload: CreateDocument,
    ) -> Result<Document, SinkronError> {
        let mut conn = self.connect().await?;

        // TODO check for duplicate doc id ?

        let is_ref = schema::collections::table
            .select(schema::collections::is_ref)
            .find(&payload.col)
            .first(&mut conn)
            .await
            .map_err(|err| match err {
                diesel::NotFound => {
                    (ErrorCode::NotFound, "Collection not found".to_string())
                }
                err => (ErrorCode::InternalServerError, err.to_string()),
            })?;

        if is_ref {
            return Err((
                ErrorCode::UnprocessableContent,
                "Creating documents is not supported in ref collections"
                    .to_string(),
            ));
        }

        let data = BASE64_STANDARD.decode(&payload.data).map_err(|_| {
            (
                ErrorCode::BadRequest,
                "Couldn't decode data from base64".to_string(),
            )
        })?;

        // increment colrev
        let next_colrev = self.increment_colrev(&payload.col).await?;

        // create document
        let new_doc = models::NewDocument {
            id: payload.id,
            col_id: payload.col.clone(),
            colrev: next_colrev,
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

        // broadcast message
        let msg = ServerChangeMessage {
            id: payload.id,
            col: payload.col.clone(),
            colrev: next_colrev,
            op: Op::Create,
            data: payload.data.clone(),
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
            changeid: "".to_string(), // TODO payload.changeid
        };
        self.broadcast(payload.col.clone(), ServerMessage::Change(msg))
            .await?;

        // return document
        let doc = Document {
            id: payload.id,
            created_at: created_at.clone(),
            updated_at: created_at,
            data: Some(payload.data),
            col: payload.col,
            colrev: next_colrev,
            permissions: "".to_string(),
        };
        Ok(doc)
    }

    async fn get_document(
        &self,
        id: uuid::Uuid,
    ) -> Result<Document, SinkronError> {
        let mut conn = self.connect().await?;

        let doc: models::Document = schema::documents::table
            .find(id)
            .first(&mut conn)
            .await
            .map_err(|err| match err {
                diesel::NotFound => {
                    (ErrorCode::NotFound, "Document not found".to_string())
                }
                err => (ErrorCode::InternalServerError, err.to_string()),
            })?;

        let doc = Document {
            id: doc.id,
            created_at: doc.created_at,
            updated_at: doc.created_at,
            data: doc.data.map(|data| BASE64_STANDARD.encode(data)),
            col: doc.col_id,
            colrev: doc.colrev,
            permissions: doc.permissions,
        };

        Ok(doc)
    }

    async fn update_document(
        &self,
        id: uuid::Uuid,
        update: String,
    ) -> Result<Document, SinkronError> {
        let mut conn = self.connect().await?;

        let doc: models::Document = schema::documents::table
            .find(id)
            .first(&mut conn)
            .await
            .map_err(|err| match err {
                diesel::NotFound => {
                    (ErrorCode::NotFound, "Document not found".to_string())
                }
                err => (ErrorCode::InternalServerError, err.to_string()),
            })?;

        let Some(data) = doc.data else {
            return Err((
                ErrorCode::UnprocessableContent,
                "Couldn't update deleted document".to_string(),
            ));
        };

        let loro_doc = loro::LoroDoc::new();
        if loro_doc.import(&data).is_err() {
            return Err((
                ErrorCode::InternalServerError,
                "Couldn't open document, data might be corrupted".to_string(),
            ));
        }

        let decoded_update = BASE64_STANDARD.decode(&update).map_err(|_| {
            (
                ErrorCode::BadRequest,
                "Couldn't decode update from base64".to_string(),
            )
        })?;
        if loro_doc.import(&decoded_update).is_err() {
            return Err((
                ErrorCode::UnprocessableContent,
                "Couldn't import update".to_string(),
            ));
        }
        let snapshot = loro_doc.export_snapshot();

        let colrev = self.increment_colrev(&doc.col_id).await?;

        // TODO increment refs colrev

        let doc_update = models::DocumentUpdate {
            colrev,
            data: &snapshot,
        };
        let updated_at = diesel::update(schema::documents::table)
            .filter(schema::documents::id.eq(&id))
            .set(doc_update)
            .returning(schema::documents::updated_at)
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;

        // TODO broadcast change message

        let updated = Document {
            id: doc.id,
            created_at: doc.created_at,
            updated_at,
            data: Some(BASE64_STANDARD.encode(snapshot)),
            col: doc.col_id,
            colrev: doc.colrev,
            permissions: doc.permissions,
        };

        Ok(updated)
    }

    async fn add_document_to_collection(
        &self,
        id: uuid::Uuid,
        col: String,
    ) -> Result<(), SinkronError> {
        let mut conn = self.connect().await?;

        // select is_ref, colrev
        let num = schema::collections::table
            .count()
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;

        if num == 0 {
            return Err((
                ErrorCode::NotFound,
                "Collection not found".to_string(),
            ));
        }

        let new_ref = models::NewRef {
            doc_id: id,
            col_id: col,
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

    // remove_document_from_collection
    // create_group
    // delete_group
    // add_user_to_group
    // remove_user_from_group
    // delete_user
    // check_collection_permissions
    // update_collection_permissions
    // check_document_permissions
    // update_document_permissions

    fn app(&self) -> Router {
        Router::new()
            .route("/", get(root))
            // WebSockets
            .route("/sync", any(sync_collection))
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
            .with_state(self.clone())
    }

    pub async fn listen(&self) {
        let app = self.app();
        let listener =
            tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
        axum::serve(listener, app).await.unwrap();
    }
}

// Handlers

fn sinkron_err_to_http(err: SinkronError) -> (StatusCode, String) {
    let code = match err.0 {
        ErrorCode::BadRequest => StatusCode::BAD_REQUEST,
        ErrorCode::AuthFailed => StatusCode::UNAUTHORIZED,
        ErrorCode::NotFound => StatusCode::NOT_FOUND,
        ErrorCode::Forbidden => StatusCode::FORBIDDEN,
        ErrorCode::UnprocessableContent => StatusCode::UNPROCESSABLE_ENTITY,
        ErrorCode::InternalServerError => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (code, err.1)
}
async fn root() -> &'static str {
    "Hello, World!"
}

async fn sync_collection(
    ws: WebSocketUpgrade,
    State(state): State<Sinkron>,
) -> Response {
    ws.on_upgrade(move |ws| handle_connect(state, ws))
}

async fn handle_connect(state: Sinkron, ws: WebSocket) {
    state.handle_connect(ws).await;
}

// Collections

async fn create_collection(
    State(state): State<Sinkron>,
    Json(payload): Json<models::NewCollection>,
) -> Result<Json<models::Collection>, (StatusCode, String)> {
    let col = state
        .create_collection(payload)
        .await
        .map_err(sinkron_err_to_http)?;
    Ok(Json(col))
}

async fn get_collection(
    State(state): State<Sinkron>,
    Json(id): Json<Id>,
) -> Result<Json<models::Collection>, (StatusCode, String)> {
    let col = state
        .get_collection(id.id)
        .await
        .map_err(sinkron_err_to_http)?;
    Ok(Json(col))
}

async fn delete_collection(
    State(state): State<Sinkron>,
    Json(id): Json<Id>,
) -> Result<(), (StatusCode, String)> {
    state
        .delete_collection(id.id)
        .await
        .map_err(sinkron_err_to_http)
}

// Documents

async fn create_document(
    State(state): State<Sinkron>,
    Json(payload): Json<CreateDocument>,
) -> Result<Json<Document>, (StatusCode, String)> {
    let doc = state
        .create_document(payload)
        .await
        .map_err(sinkron_err_to_http)?;
    Ok(Json(doc))
}

async fn get_document(
    State(state): State<Sinkron>,
    Json(id): Json<Uuid>,
) -> Result<Json<Document>, (StatusCode, String)> {
    let doc = state
        .get_document(id.id)
        .await
        .map_err(sinkron_err_to_http)?;
    Ok(Json(doc))
}

async fn update_document(
    State(state): State<Sinkron>,
    Json(payload): Json<UpdateDocument>,
) -> Result<Json<Document>, (StatusCode, String)> {
    let doc = state
        .update_document(payload.id, payload.update)
        .await
        .map_err(sinkron_err_to_http)?;
    Ok(Json(doc))
}

// { id }
async fn delete_document() -> &'static str {
    "Hello, World!"
}

// Refs

async fn add_document_to_collection(
    State(sinkron): State<Sinkron>,
    Json(payload): Json<AddRemoveDocument>,
) -> Result<(), (StatusCode, String)> {
    sinkron
        .add_document_to_collection(payload.id, payload.col)
        .await
        .map_err(sinkron_err_to_http)
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
