use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::{Query, State},
    // http::StatusCode,
    response::Response,
    routing::{any, get, post},
    // Json,
    Router,
};
use base64::prelude::*;
use diesel::prelude::*;
use diesel_async::{
    pooled_connection::AsyncDieselConnectionManager, AsyncPgConnection,
    RunQueryDsl,
};
use futures_util::{
    sink::SinkExt,
    stream::{SplitSink, SplitStream, StreamExt},
};
use log::trace;
use std::collections::HashMap;
use tokio::select;
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

use crate::models;
use crate::protocol::*;
use crate::schema;

type SinkronError = (ErrorCode, String);

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

type DbConnectionPool =
    bb8::Pool<AsyncDieselConnectionManager<diesel_async::AsyncPgConnection>>;

pub struct DbConfig {
    pub host: String,
    pub port: i32,
    pub user: String,
    pub password: String,
    pub database: String,
}

async fn create_pool(config: DbConfig) -> DbConnectionPool {
    let config_string = format!(
        "host={} port={} user={} password={} dbname={}",
        config.host, config.port, config.user, config.password, config.database,
    );
    let manager =
        AsyncDieselConnectionManager::<diesel_async::AsyncPgConnection>::new(
            config_string,
        );
    let pool = bb8::Pool::builder().build(manager).await.unwrap();
    pool
}

// Actor that forwards messages to the webscoket connection.

struct ClientWriteActor {
    client_id: i32,
    ws_sender: SplitSink<WebSocket, Message>,
    client_chan_receiver: mpsc::Receiver<ServerMessage>,
}

impl ClientWriteActor {
    async fn run(&mut self) {
        trace!("client-{}: sender actor start", self.client_id);
        while let Some(msg) = self.client_chan_receiver.recv().await {
            if let Ok(encoded) = serde_json::to_string(&msg) {
                let _ = self.ws_sender.send(Message::Text(encoded)).await;
                trace!("client-{}: sent message to websocket", self.client_id);
            }
            // TODO handle error
        }
        trace!("client-{}: sender actor exit", self.client_id);
    }
}

// Actor that receives messages from the webscoket connection,
// dispatches them to the Collection and when needed waits for the response
// and replies back.

struct ClientReadActor {
    client_id: i32,
    ws_receiver: SplitStream<WebSocket>,
    collection: CollectionHandle,
    colrev: Option<i64>,
    client_chan_sender: mpsc::Sender<ServerMessage>,
    cancel_token: CancellationToken,
}

impl ClientReadActor {
    async fn run(&mut self) {
        trace!("client-{}: receiver actor start", self.client_id);

        if self.sync(self.colrev).await.is_err() {
            trace!("client-{}: sync failed", self.client_id);
            self.handle_disconnect().await;
            return;
        } else {
            trace!("client-{}: sync completed", self.client_id);
        }

        loop {
            select! {
                _ = self.cancel_token.cancelled() => {
                    self.handle_disconnect().await;
                    break;
                },
                msg = self.ws_receiver.next() => {
                    match msg {
                        Some(Ok(msg)) => {
                            trace!(
                                "client-{}: receive websocket message",
                                self.client_id
                            );
                            self.handle_message(msg).await;
                        },
                        _ => {
                            self.handle_disconnect().await;
                            break;
                        }
                    }
                }
            }
        }

        trace!("client-{}: receiver actor exit", self.client_id);
    }

    async fn sync(&self, colrev: Option<i64>) -> Result<(), SinkronError> {
        let (sender, receiver) = oneshot::channel();
        let _ = self
            .collection
            .send(CollectionMessage::Sync(colrev, sender))
            .await;
        match receiver.await {
            Ok(Ok(res)) => {
                // send documents & sync_complete to client
            }
            _ => {
                // send sync error to client
            }
        };
        Ok(())
    }

    async fn handle_message(&self, msg: Message) {
        let Message::Text(str) = msg else {
            // unsupported message type
            return;
        };
        let Ok(deserialized) = serde_json::from_str::<ClientMessage>(&str)
        else {
            // deserialize error
            return;
        };
        match deserialized {
            ClientMessage::Heartbeat(msg) => self.handle_heartbeat(msg).await,
            ClientMessage::Get(msg) => self.handle_get(msg).await,
            ClientMessage::Change(msg) => self.handle_change(msg).await,
        };
    }

    async fn handle_heartbeat(&self, msg: HeartbeatMessage) {
        let reply = HeartbeatMessage { i: msg.i + 1 };
        self.send_message(ServerMessage::Heartbeat(reply)).await;
    }

    async fn handle_get(&self, msg: GetMessage) {
        let (sender, receiver) = oneshot::channel();
        let send = self
            .collection
            .send(CollectionMessage::Get(msg.id, sender))
            .await;
        if send.is_err() {
            // couldn't send, reply with get error ?
            return;
        }
        match receiver.await {
            Ok(Ok(doc)) => {
                let msg = DocMessage {
                    id: doc.id,
                    col: doc.col,
                    colrev: doc.colrev,
                    data: doc.data,
                    created_at: doc.created_at,
                    updated_at: doc.updated_at,
                };
                self.send_message(ServerMessage::Doc(msg)).await;
            }
            Ok(Err(err)) => {
                // Couldn't get document
                let err = GetErrorMessage {
                    id: msg.id,
                    code: err.0,
                };
                self.send_message(ServerMessage::GetError(err)).await;
            }
            Err(_) => {
                // Couldn't receive
                let err = GetErrorMessage {
                    id: msg.id,
                    code: ErrorCode::InternalServerError,
                };
                self.send_message(ServerMessage::GetError(err)).await;
            }
        }
    }

    async fn handle_change(&self, msg: ClientChangeMessage) {
        let Ok(data) = BASE64_STANDARD.decode(&msg.data) else {
            // send change error (decode error)
            return;
        };

        let (sender, receiver) = oneshot::channel();
        self.collection
            .send(CollectionMessage::Update(msg.id, data, sender))
            .await;
        match receiver.await {
            Ok(Ok(_)) => {
                // change success
            }
            Ok(Err(err)) => {
                let err = ChangeErrorMessage {
                    id: msg.id,
                    changeid: msg.changeid,
                    code: err.0,
                };
                self.send_message(ServerMessage::ChangeError(err)).await;
            }
            Err(_) => {
                let err = ChangeErrorMessage {
                    id: msg.id,
                    changeid: msg.changeid,
                    code: ErrorCode::InternalServerError,
                };
                self.send_message(ServerMessage::ChangeError(err)).await;
            }
        }
    }

    async fn handle_disconnect(&self) {
        trace!("client-{}: disconnect", self.client_id);
        self.collection
            .send(CollectionMessage::Unsubscribe(self.client_id))
            .await;
    }

    async fn send_message(&self, msg: ServerMessage) {
        self.client_chan_sender.send(msg).await;
        // if couldnt write, then writer actor is dead, so should disconnect ?
    }
}

// Client handle is shared by two actors - reader and writer

#[derive(Clone)]
struct ClientHandle {
    cancel_token: CancellationToken,
    client_chan_sender: mpsc::Sender<ServerMessage>,
}

impl ClientHandle {
    fn new(
        client_id: i32,
        ws: WebSocket,
        collection: CollectionHandle,
        colrev: Option<i64>,
    ) -> Self {
        let (ws_sender, ws_receiver) = ws.split();

        let cancel_token = CancellationToken::new();
        let (client_chan_sender, client_chan_receiver) = mpsc::channel(8);
        let mut writer = ClientWriteActor {
            client_id,
            ws_sender,
            client_chan_receiver,
        };
        tokio::spawn(async move { writer.run().await });

        let mut reader = ClientReadActor {
            colrev,
            client_id,
            collection,
            cancel_token: cancel_token.clone(),
            ws_receiver,
            client_chan_sender: client_chan_sender.clone(),
        };
        tokio::spawn(async move { reader.run().await });

        Self {
            cancel_token,
            client_chan_sender,
        }
    }

    // async fn send_message_raw(&self, msg: Message) {
    // self.client_chan_sender.send(msg).await;
    // }

    async fn send_message(&self, msg: ServerMessage) {
        self.client_chan_sender.send(msg).await;
    }

    async fn disconnect(&self) {
        self.cancel_token.cancel();
    }
}

enum CollectionMessage {
    Subscribe(i32, ClientHandle),
    Unsubscribe(i32),
    Get(uuid::Uuid, oneshot::Sender<Result<Document, SinkronError>>),
    Sync(Option<i64>, oneshot::Sender<Result<(), SinkronError>>),
    Create(
        uuid::Uuid,
        Vec<i8>,
        oneshot::Sender<Result<(), SinkronError>>,
    ),
    Delete(uuid::Uuid, oneshot::Sender<Result<(), SinkronError>>),
    Update(
        uuid::Uuid,
        Vec<u8>,
        oneshot::Sender<Result<(), SinkronError>>,
    ),
}

struct CollectionActor {
    id: String,
    receiver: mpsc::Receiver<CollectionMessage>,
    subscribers: std::collections::HashMap<i32, ClientHandle>,
    pool: DbConnectionPool,
}

impl CollectionActor {
    async fn run(&mut self) {
        trace!("col-{}: actor start", self.id);
        while let Some(msg) = self.receiver.recv().await {
            self.handle_message(msg).await;
        }
        trace!("col-{}: actor exit", self.id);
    }

    async fn handle_message(&mut self, msg: CollectionMessage) {
        match msg {
            CollectionMessage::Subscribe(id, handle) => {
                self.subscribers.insert(id, handle);
                trace!("col-{}: client subscribe, id: {}", self.id, id);
            }
            CollectionMessage::Unsubscribe(id) => {
                self.subscribers.remove(&id);
                trace!("col-{}: client unsubscribe, id: {}", self.id, id);
            }
            CollectionMessage::Sync(colrev, sender) => {
                trace!("col-{}: sync, colrev: {:?}", self.id, colrev);
            }
            CollectionMessage::Get(id, sender) => {
                trace!("col-{}: get document, id: {}", self.id, id);
                let res = self.get_document(id).await;
            }
            CollectionMessage::Create(id, data, sender) => {
                trace!("col-{}: create, id: {}", self.id, id);
                // let res = self.create_document(id, data, None).await;
            }
            CollectionMessage::Update(id, update, sender) => {
                trace!("col-{}: update, id: {}", self.id, id);
                // let res = self.update_document(id, update).await;
            }
            CollectionMessage::Delete(id, sender) => {
                trace!("col-{}: delete, id: {}", self.id, id);
                // let res = self.delete_document(id).await;
            }
        }
    }

    async fn connect(&self) -> Result<DbConnection, SinkronError> {
        self.pool.get_owned().await.map_err(internal_error)
    }

    async fn increment_colrev(&self) -> Result<i64, SinkronError> {
        let mut conn = self.connect().await?;
        use schema::collections;
        let colrev: i64 = diesel::update(collections::table)
            .filter(collections::id.eq(&self.id))
            .set(collections::colrev.eq(collections::colrev + 1))
            .returning(collections::colrev)
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?; // TODO not_found ?
        Ok(colrev)
    }

    async fn create_document(
        &self,
        id: uuid::Uuid,
        data: String,
        permissions: Option<String>,
    ) -> Result<Document, SinkronError> {
        let mut conn = self.connect().await?;

        // TODO check for duplicate doc id ?

        /*
        NOT NEEDED ?
        let is_ref = schema::collections::table
            .select(schema::collections::is_ref)
            .find(&self.id)
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
        */

        let decoded = BASE64_STANDARD.decode(&data).map_err(|_| {
            (
                ErrorCode::BadRequest,
                "Couldn't decode data from base64".to_string(),
            )
        })?;

        // increment colrev
        let next_colrev = self.increment_colrev().await?;

        // create document
        let new_doc = models::NewDocument {
            id,
            col_id: self.id.clone(),
            colrev: next_colrev,
            data: decoded,
            permissions: "".to_string(), // TODO
        };
        let created_at: chrono::DateTime<chrono::Utc> =
            diesel::insert_into(schema::documents::table)
                .values(&new_doc)
                .returning(schema::documents::created_at)
                .get_result(&mut conn)
                .await
                .map_err(internal_error)?;

        // broadcast message to subscribers
        let msg = ServerChangeMessage {
            id,
            col: self.id.clone(),
            colrev: next_colrev,
            op: Op::Create,
            data: data.clone(),
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
            changeid: "".to_string(), // TODO payload.changeid
        };

        for client in self.subscribers.values() {
            // TODO more efficient broadcast
            client.send_message(ServerMessage::Change(msg.clone()));
        }

        // return document
        let doc = Document {
            id,
            created_at: created_at.clone(),
            updated_at: created_at,
            data: Some(data),
            col: self.id.clone(),
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

        let colrev = self.increment_colrev().await?;

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
}

#[derive(Clone)]
struct CollectionHandle {
    id: String,
    sender: mpsc::Sender<CollectionMessage>,
}

impl CollectionHandle {
    fn new(id: String, pool: DbConnectionPool) -> Self {
        let (sender, receiver) = mpsc::channel(100);

        let mut actor = CollectionActor {
            id: id.clone(),
            subscribers: HashMap::new(),
            receiver,
            pool,
        };
        tokio::spawn(async move { actor.run().await });

        CollectionHandle { id, sender }
    }

    async fn send(
        &self,
        msg: CollectionMessage,
    ) -> Result<(), mpsc::error::SendError<CollectionMessage>> {
        self.sender.send(msg).await
    }
}

enum SinkronActorMessage {
    Connect(WebSocket, String, Option<i64>),
}

struct SinkronActor {
    receiver: mpsc::UnboundedReceiver<SinkronActorMessage>,
    client_id: i32,
    collections: HashMap<String, CollectionHandle>,
    pool: DbConnectionPool,
}

impl SinkronActor {
    async fn run(&mut self) {
        trace!("sinkron: actor start");
        while let Some(msg) = self.receiver.recv().await {
            match msg {
                SinkronActorMessage::Connect(ws, col, colrev) => {
                    self.handle_connect(ws, col, colrev).await;
                }
            }
        }
        trace!("sinkron: actor exit");
    }

    async fn handle_connect(
        &mut self,
        ws: WebSocket,
        col: String,
        colrev: Option<i64>,
    ) {
        trace!("sinkron: client connect");

        // authorize

        // check if collection exists

        // check permissions

        let collection = self.get_collection_actor(&col).await;

        // start client actor
        let client_id = self.get_client_id();
        let client =
            ClientHandle::new(client_id, ws, collection.clone(), colrev);

        // subscribe client to collection
        let _ = collection
            .send(CollectionMessage::Subscribe(client_id, client))
            .await;
    }

    fn get_client_id(&mut self) -> i32 {
        self.client_id += 1;
        self.client_id
    }

    async fn get_collection_actor(&mut self, id: &str) -> CollectionHandle {
        match self.collections.get(id) {
            Some(col) => col.clone(),
            None => {
                let col =
                    CollectionHandle::new(id.to_string(), self.pool.clone());
                self.collections.insert(id.to_string(), col.clone());
                col
            }
        }
    }

    /*
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
    */
}

#[derive(Clone)]
struct SinkronActorHandle {
    sender: mpsc::UnboundedSender<SinkronActorMessage>,
}

impl SinkronActorHandle {
    fn new(pool: DbConnectionPool) -> Self {
        let (sender, receiver) = mpsc::unbounded_channel();

        let mut actor = SinkronActor {
            receiver,
            client_id: 0,
            collections: HashMap::new(),
            pool,
        };
        tokio::spawn(async move { actor.run().await });

        Self { sender }
    }

    fn send(&self, msg: SinkronActorMessage) {
        _ = self.sender.send(msg);
    }
}

pub struct Sinkron;

impl Sinkron {
    pub fn new() -> Self {
        Self {}
    }

    fn app(&self, sinkron: SinkronActorHandle) -> Router {
        Router::new()
            .route("/", get(root))
            // WebSockets
            .route("/sync", any(sync_handler))
            /*
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
            */
            .with_state(sinkron)
    }

    pub async fn listen(&self, db_config: DbConfig) {
        let pool = create_pool(db_config).await;
        let sinkron = SinkronActorHandle::new(pool);
        let app = self.app(sinkron);
        let listener =
            tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
        axum::serve(listener, app).await.unwrap();
    }
}

async fn root() -> &'static str {
    "Hello, World!"
}

#[derive(serde::Deserialize)]
struct SyncQuery {
    col: String,
    colrev: Option<i64>,
}

async fn sync_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<SyncQuery>,
    State(state): State<SinkronActorHandle>,
) -> Response {
    ws.on_upgrade(move |ws| handle_connect(state, ws, query))
}

async fn handle_connect(
    sinkron: SinkronActorHandle,
    ws: WebSocket,
    query: SyncQuery,
) {
    _ = sinkron.send(SinkronActorMessage::Connect(ws, query.col, query.colrev));
}
