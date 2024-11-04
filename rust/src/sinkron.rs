use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::{Query, Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{any, get, post},
    Json, Router,
};
use base64::prelude::*;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use log::trace;
use serde;
use tokio::{
    select,
    sync::{mpsc, oneshot, Notify},
    time::{sleep, Duration},
};

use crate::db;
use crate::models;
use crate::protocol::*;
use crate::schema;

#[derive(serde::Serialize, Debug)]
struct SinkronError {
    code: ErrorCode,
    message: String,
}

impl SinkronError {
    fn bad_request(msg: &str) -> Self {
        Self {
            code: ErrorCode::BadRequest,
            message: msg.to_string(),
        }
    }
    fn auth_failed(msg: &str) -> Self {
        Self {
            code: ErrorCode::AuthFailed,
            message: msg.to_string(),
        }
    }
    fn not_found(msg: &str) -> Self {
        Self {
            code: ErrorCode::NotFound,
            message: msg.to_string(),
        }
    }
    fn forbidden(msg: &str) -> Self {
        Self {
            code: ErrorCode::Forbidden,
            message: msg.to_string(),
        }
    }
    fn unprocessable(msg: &str) -> Self {
        Self {
            code: ErrorCode::UnprocessableContent,
            message: msg.to_string(),
        }
    }
    fn internal(msg: &str) -> Self {
        Self {
            code: ErrorCode::InternalServerError,
            message: msg.to_string(),
        }
    }
}

/// Utility function for mapping any error into an Internal Server Error
fn internal_error<E>(err: E) -> SinkronError
where
    E: std::error::Error,
{
    SinkronError::internal(&err.to_string())
}

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

#[derive(Clone)]
struct Supervisor {
    stop: Arc<Notify>,
    exit: Arc<Notify>,
}

type ExitCallback = Box<dyn FnOnce() + Send>;

impl Supervisor {
    fn new() -> Self {
        Self {
            stop: Arc::new(Notify::new()),
            exit: Arc::new(Notify::new()),
        }
    }

    fn spawn<T>(&self, task: T, on_exit: Option<ExitCallback>)
    where
        T: std::future::Future + Send + 'static,
    {
        let stop = self.stop.clone();
        let exit = self.exit.clone();
        tokio::spawn(async move {
            select! {
                _ = stop.notified() => {},
                _ = task => {},
            }
            exit.notify_waiters();
            if let Some(on_exit) = on_exit {
                on_exit();
            }
        });
    }
}

// Client actor receives messages from the webscoket connection,
// dispatches them to the Collection and when needed waits for the response
// and replies back.

struct ClientActor {
    supervisor: Supervisor,
    client_id: i32,
    websocket: WebSocket,
    receiver: mpsc::Receiver<ServerMessage>,
    collection: CollectionHandle,
    colrev: Option<i64>,
}

impl ClientActor {
    async fn run(&mut self) {
        trace!("client-{}: start", self.client_id);

        if self.sync(self.colrev).await.is_err() {
            trace!("client-{}: sync failed", self.client_id);
            return;
        } else {
            trace!("client-{}: sync completed", self.client_id);
        }

        loop {
            select! {
                msg = self.websocket.recv() => {
                    match msg {
                        Some(Ok(msg)) => self.handle_message(msg).await,
                        _ => break
                    }
                },
                Some(msg) = self.receiver.recv() => {
                    self.send_message(msg).await;
                }
            }
        }
    }

    async fn sync(&mut self, colrev: Option<i64>) -> Result<(), SinkronError> {
        let (sender, receiver) = oneshot::channel();
        let msg = CollectionMessage::Sync {
            colrev,
            reply: sender,
        };
        self.collection.send(msg);
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

    async fn handle_message(&mut self, msg: Message) {
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

    async fn handle_heartbeat(&mut self, msg: HeartbeatMessage) {
        let reply = HeartbeatMessage { i: msg.i + 1 };
        self.send_message(ServerMessage::Heartbeat(reply)).await;
        // TODO disconnect timeout
    }

    async fn handle_get(&mut self, msg: GetMessage) {
        let (sender, receiver) = oneshot::channel();
        let send = self.collection.send(CollectionMessage::Get {
            id: msg.id,
            reply: sender,
        });
        if send.is_err() {
            // TODO couldn't send, just exit ?
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
                    code: err.code,
                };
                self.send_message(ServerMessage::GetError(err)).await;
            }
            Err(_) => {
                // Couldn't receive reply
                // TODO - just exit ?
                let err = GetErrorMessage {
                    id: msg.id,
                    code: ErrorCode::InternalServerError,
                };
                self.send_message(ServerMessage::GetError(err)).await;
            }
        }
    }

    async fn handle_change(&mut self, msg: ClientChangeMessage) {
        let (sender, receiver) = oneshot::channel();
        let col_msg = match msg.op {
            Op::Create => CollectionMessage::Create {
                id: msg.id,
                data: msg.data,
                reply: sender,
            },
            Op::Update => CollectionMessage::Create {
                id: msg.id,
                data: msg.data,
                reply: sender,
            },
            Op::Delete => CollectionMessage::Delete {
                id: msg.id,
                reply: sender,
            },
        };
        self.collection.send(col_msg);
        match receiver.await {
            Ok(Ok(_)) => {
                // change success
            }
            Ok(Err(err)) => {
                let err = ChangeErrorMessage {
                    id: msg.id,
                    changeid: msg.changeid,
                    code: err.code,
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

    async fn send_message(&mut self, msg: ServerMessage) {
        if let Ok(encoded) = serde_json::to_string(&msg) {
            let _ = self.websocket.send(Message::Text(encoded)).await;
            trace!("client-{}: sent message to websocket", self.client_id);
        }
        // TODO if couldnt write, then writer actor is dead, so exit
    }
}

#[derive(Clone)]
struct ClientHandle {
    sender: mpsc::Sender<ServerMessage>,
    supervisor: Supervisor,
}

impl ClientHandle {
    fn new(
        client_id: i32,
        websocket: WebSocket,
        collection: CollectionHandle,
        colrev: Option<i64>,
        on_exit: Option<ExitCallback>,
    ) -> Self {
        let (sender, receiver) = mpsc::channel(8);
        let supervisor = Supervisor::new();
        let mut reader = ClientActor {
            supervisor: supervisor.clone(),
            colrev,
            client_id,
            collection,
            websocket,
            receiver,
        };
        supervisor.spawn(async move { reader.run().await }, on_exit);

        Self { supervisor, sender }
    }

    // async fn send_message_raw(&self, msg: Message) {
    // self.client_chan_sender.send(msg).await;
    // }

    async fn send_message(&self, msg: ServerMessage) {
        self.sender.send(msg).await;
    }
}

// Collection actor performs document operations over single collection,
// then replies back with results and also broadcasts messages to all
// active subscribers of the collection.

enum CollectionMessage {
    Subscribe {
        client_id: i32,
        handle: ClientHandle,
    },
    Unsubscribe {
        client_id: i32,
    },
    Get {
        id: uuid::Uuid,
        reply: oneshot::Sender<Result<Document, SinkronError>>,
    },
    Sync {
        colrev: Option<i64>,
        reply: oneshot::Sender<Result<(), SinkronError>>,
    },
    Create {
        id: uuid::Uuid,
        data: String,
        reply: oneshot::Sender<Result<Document, SinkronError>>,
    },
    Update {
        id: uuid::Uuid,
        data: String,
        reply: oneshot::Sender<Result<Document, SinkronError>>,
    },
    Delete {
        id: uuid::Uuid,
        reply: oneshot::Sender<Result<Document, SinkronError>>,
    },
}

struct CollectionActor {
    supervisor: Supervisor,
    id: String,
    pool: db::DbConnectionPool,
    receiver: mpsc::UnboundedReceiver<CollectionMessage>,
    subscribers: std::collections::HashMap<i32, ClientHandle>,
    timeout_task: Option<tokio::task::JoinHandle<()>>,
}

impl CollectionActor {
    fn new(
        id: String,
        receiver: mpsc::UnboundedReceiver<CollectionMessage>,
        pool: db::DbConnectionPool,
        supervisor: Supervisor,
    ) -> Self {
        Self {
            id,
            receiver,
            pool,
            subscribers: HashMap::new(),
            supervisor,
            timeout_task: None,
        }
    }

    async fn run(&mut self) {
        trace!("col-{}: actor start", self.id);
        while let Some(msg) = self.receiver.recv().await {
            self.handle_message(msg).await;
        }
        trace!("col-{}: actor exit", self.id);
    }

    async fn handle_message(&mut self, msg: CollectionMessage) {
        match msg {
            CollectionMessage::Subscribe { client_id, handle } => {
                self.handle_subscribe(client_id, handle).await;
                trace!("col-{}: client subscribed, id: {}", self.id, client_id);
            }
            CollectionMessage::Unsubscribe { client_id } => {
                self.handle_unsubscribe(client_id).await;
                trace!(
                    "col-{}: client unsubscribed, id: {}",
                    self.id,
                    client_id
                );
            }
            CollectionMessage::Sync { colrev, reply } => {
                trace!("col-{}: sync, colrev: {:?}", self.id, colrev);
            }
            CollectionMessage::Get { id, reply } => {
                trace!("col-{}: get document, id: {}", self.id, id);
                let res = self.get_document(id).await;
            }
            CollectionMessage::Create { id, data, reply } => {
                trace!("col-{}: create, id: {}", self.id, id);
                let res = self.create_document(id, data, None).await;
                reply.send(res);
            }
            CollectionMessage::Update { id, data, reply } => {
                trace!("col-{}: update, id: {}", self.id, id);
                let res = self.update_document(id, data).await;
                reply.send(res);
            }
            CollectionMessage::Delete { id, reply } => {
                trace!("col-{}: delete, id: {}", self.id, id);
                let res = self.delete_document(id).await;
                reply.send(res);
            }
        }
    }

    async fn handle_subscribe(&mut self, id: i32, handle: ClientHandle) {
        self.subscribers.insert(id, handle);
        self.timeout_task = None;
    }

    async fn handle_unsubscribe(&mut self, id: i32) {
        self.subscribers.remove(&id);
        if self.subscribers.len() == 0 {
            let id = self.id.clone();
            let stop = self.supervisor.stop.clone();
            self.timeout_task = Some(tokio::spawn(async move {
                sleep(Duration::from_secs(5)).await;
                trace!("col-{}: disconnect by timeout", id);
                stop.notify_waiters();
            }));
            trace!("col-{}: last client unsubscribed", self.id);
        }
    }

    async fn connect(&self) -> Result<db::DbConnection, SinkronError> {
        self.pool.get().await.map_err(internal_error)
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
            SinkronError::bad_request("Couldn't decode data from base64")
        })?;

        println!("Data: {}", decoded.len());

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
            client
                .send_message(ServerMessage::Change(msg.clone()))
                .await;
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
                    SinkronError::not_found("Document not found")
                }
                err => SinkronError::internal(&err.to_string()),
            })?;

        let doc = Document {
            id: doc.id,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
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
                    SinkronError::not_found("Document not found")
                }
                err => SinkronError::internal(&err.to_string()),
            })?;

        let Some(data) = doc.data else {
            return Err(SinkronError::unprocessable(
                "Couldn't update deleted document",
            ));
        };
        let Ok(decoded_update) = BASE64_STANDARD.decode(&update) else {
            return Err(SinkronError::bad_request(
                "Couldn't decode update from base64",
            ));
        };
        let loro_doc = loro::LoroDoc::new();
        if let Err(e) = loro_doc.import(&data) {
            return Err(SinkronError::internal(
                "Couldn't open document, data might be corrupted",
            ));
        }
        if loro_doc.import(&decoded_update).is_err() {
            return Err(SinkronError::bad_request("Couldn't import update"));
        }
        let Ok(snapshot) = loro_doc.export(loro::ExportMode::Snapshot) else {
            return Err(SinkronError::bad_request("Couldn't export snapshot"));
        };

        let next_colrev = self.increment_colrev().await?;

        // TODO increment refs colrev

        let doc_update = models::DocumentUpdate {
            colrev: next_colrev,
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
            colrev: next_colrev,
            permissions: doc.permissions,
        };

        Ok(updated)
    }

    async fn delete_document(
        &self,
        id: uuid::Uuid,
    ) -> Result<Document, SinkronError> {
        // let mut conn = self.connect().await?;

        // TODO

        Err(SinkronError::internal("Not implemented"))
    }
}

#[derive(Clone)]
struct CollectionHandle {
    id: String,
    sender: mpsc::UnboundedSender<CollectionMessage>,
    supervisor: Supervisor,
}

impl CollectionHandle {
    fn new(
        id: String,
        pool: db::DbConnectionPool,
        on_exit: Option<ExitCallback>,
    ) -> Self {
        let (sender, receiver) = mpsc::unbounded_channel();
        let supervisor = Supervisor::new();
        let mut actor = CollectionActor::new(
            id.clone(),
            receiver,
            pool,
            supervisor.clone(),
        );
        supervisor.spawn(async move { actor.run().await }, on_exit);
        CollectionHandle {
            id,
            sender,
            supervisor,
        }
    }

    fn send(
        &self,
        msg: CollectionMessage,
    ) -> Result<(), mpsc::error::SendError<CollectionMessage>> {
        self.sender.send(msg)
    }
}

enum SinkronActorMessage {
    Connect {
        websocket: WebSocket,
        col: String,
        colrev: Option<i64>,
    },
    GetCollection {
        col: String,
        reply: oneshot::Sender<CollectionHandle>,
    },
}

struct SinkronActor {
    receiver: mpsc::UnboundedReceiver<SinkronActorMessage>,
    client_id: i32,
    collections: HashMap<String, CollectionHandle>,
    pool: db::DbConnectionPool,
    exit_channel: (
        mpsc::UnboundedSender<String>,
        mpsc::UnboundedReceiver<String>,
    ),
}

impl SinkronActor {
    fn new(
        receiver: mpsc::UnboundedReceiver<SinkronActorMessage>,
        pool: db::DbConnectionPool,
    ) -> Self {
        Self {
            receiver,
            client_id: 0,
            pool,
            collections: HashMap::new(),
            exit_channel: mpsc::unbounded_channel(),
        }
    }

    async fn run(&mut self) {
        trace!("sinkron: actor start");
        loop {
            select! {
                msg = self.receiver.recv() => {
                    match msg {
                        Some(msg) => self.handle_message(msg).await,
                        None => break
                    }
                },
                Some(id) = self.exit_channel.1.recv() => {
                    trace!("sinkron: col exit, id: {}", id);
                    self.collections.remove(&id);
                },
            }
        }
        trace!("sinkron: actor exit");
    }

    async fn handle_message(&mut self, msg: SinkronActorMessage) {
        match msg {
            SinkronActorMessage::Connect {
                websocket,
                col,
                colrev,
            } => {
                self.handle_connect(websocket, col, colrev).await;
            }
            SinkronActorMessage::GetCollection { col, reply } => {
                let handle = self.get_collection_actor(&col);
                reply.send(handle);
            }
        }
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

        // check if colrev is valid

        let collection = self.get_collection_actor(&col);

        // spawn client actor
        let client_id = self.get_client_id();
        let on_exit: ExitCallback = {
            let collection = collection.clone();
            Box::new(move || {
                trace!("client-{}: exit", client_id);
                collection.send(CollectionMessage::Unsubscribe { client_id });
            })
        };
        let client = ClientHandle::new(
            client_id,
            ws,
            collection.clone(),
            colrev,
            Some(on_exit),
        );

        // subscribe client to collection
        collection.send(CollectionMessage::Subscribe {
            client_id,
            handle: client,
        });
    }

    fn get_client_id(&mut self) -> i32 {
        self.client_id += 1;
        self.client_id
    }

    fn get_collection_actor(&mut self, id: &str) -> CollectionHandle {
        match self.collections.get(id) {
            Some(col) => col.clone(),
            None => self.spawn_collection_actor(id),
        }
    }

    fn spawn_collection_actor(&mut self, id: &str) -> CollectionHandle {
        let on_exit: ExitCallback = {
            let exit_sender = self.exit_channel.0.clone();
            let id = id.to_string();
            Box::new(move || {
                exit_sender.send(id);
            })
        };
        let col = CollectionHandle::new(
            id.to_string(),
            self.pool.clone(),
            Some(on_exit),
        );
        self.collections.insert(id.to_string(), col.clone());
        col
    }
}

#[derive(Clone)]
struct SinkronActorHandle {
    sender: mpsc::UnboundedSender<SinkronActorMessage>,
}

impl SinkronActorHandle {
    fn new(pool: db::DbConnectionPool) -> Self {
        let (sender, receiver) = mpsc::unbounded_channel();
        let mut actor = SinkronActor::new(receiver, pool);
        tokio::spawn(async move { actor.run().await });
        Self { sender }
    }

    fn send(&self, msg: SinkronActorMessage) {
        self.sender.send(msg);
    }
}

type Collection = models::Collection;

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
    actor: SinkronActorHandle,
    host: String,
    port: u32,
    api_token: String,
}

impl Sinkron {
    pub async fn new(config: SinkronConfig) -> Self {
        let pool = db::create_pool(config.db).await;
        let actor = SinkronActorHandle::new(pool.clone());
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
        receiver.await.map_err(internal_error)
    }

    // Collections

    async fn create_collection(
        &self,
        props: CreateCollection,
    ) -> Result<Collection, SinkronError> {
        let mut conn = self.connect().await?;
        // TODO check duplicate (for error message)
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
    colrev: Option<i64>,
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
