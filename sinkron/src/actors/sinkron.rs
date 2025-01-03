use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use log::debug;
use tokio::select;
use tokio::sync::{mpsc, oneshot};

use crate::actors::client::ClientHandle;
use crate::actors::collection::{CollectionHandle, CollectionMessage};
use crate::actors::supervisor::ExitCallback;
use crate::db;
use crate::error::{internal_error, SinkronError};
use crate::groups::GroupsApi;
use crate::protocol::*;
use crate::schema;
use crate::types::Collection;

pub struct ConnectMessage {
    pub websocket: WebSocket,
    pub user: String,
    pub col: String,
    pub colrev: i64,
}

pub struct GetCollectionMessage {
    pub col: String,
    pub reply: oneshot::Sender<Result<CollectionHandle, SinkronError>>,
}

pub enum SinkronActorMessage {
    Connect(ConnectMessage),
    GetCollection(GetCollectionMessage),
}

struct SinkronActor {
    receiver: mpsc::UnboundedReceiver<SinkronActorMessage>,
    client_id: i32,
    collections: HashMap<String, CollectionHandle>,
    groups_api: Arc<GroupsApi>,
    pool: db::DbConnectionPool,
    exit_channel: (
        mpsc::UnboundedSender<String>,
        mpsc::UnboundedReceiver<String>,
    ),
}

impl SinkronActor {
    fn new(
        receiver: mpsc::UnboundedReceiver<SinkronActorMessage>,
        groups_api: Arc<GroupsApi>,
        pool: db::DbConnectionPool,
    ) -> Self {
        Self {
            receiver,
            client_id: 0,
            groups_api,
            pool,
            collections: HashMap::new(),
            exit_channel: mpsc::unbounded_channel(),
        }
    }

    async fn run(&mut self) {
        debug!("sinkron: actor start");
        loop {
            select! {
                msg = self.receiver.recv() => {
                    match msg {
                        Some(msg) => self.handle_message(msg).await,
                        None => break
                    }
                },
                // XXX could break if not some?
                // if exit_channel is dropped ? should not be possible ?
                Some(id) = self.exit_channel.1.recv() => {
                    debug!("sinkron: col exit, id: {}", id);
                    self.collections.remove(&id);
                },
            }
        }
        debug!("sinkron: actor exit");
    }

    async fn handle_message(&mut self, msg: SinkronActorMessage) {
        match msg {
            SinkronActorMessage::Connect(msg) => {
                self.handle_connect(msg).await;
            }
            SinkronActorMessage::GetCollection(msg) => {
                let GetCollectionMessage { col, reply } = msg;
                let res = self.get_collection_actor_by_id(&col).await;
                _ = reply.send(res);
            }
        }
    }

    async fn connect(&self) -> Result<db::DbConnection, SinkronError> {
        self.pool.get().await.map_err(internal_error)
    }

    async fn handle_connect(&mut self, msg: ConnectMessage) {
        let ConnectMessage {
            mut websocket,
            user,
            col,
            colrev,
        } = msg;

        debug!("sinkron: client connect: {}", user);

        let Ok(mut conn) = self.connect().await else {
            let msg = ServerMessage::SyncError(SyncErrorMessage {
                col,
                code: ErrorCode::InternalServerError,
            });
            if let Ok(encoded) = serde_json::to_string(&msg) {
                let _ = websocket.send(Message::Text(encoded)).await;
            }
            return;
        };
        let res = schema::collections::table
            .find(&col)
            .first::<Collection>(&mut conn)
            .await;
        drop(conn);

        let Ok(col_model) = res else {
            // collection not found
            let msg = ServerMessage::SyncError(SyncErrorMessage {
                col,
                code: ErrorCode::NotFound,
            });
            if let Ok(encoded) = serde_json::to_string(&msg) {
                let _ = websocket.send(Message::Text(encoded)).await;
            }
            return;
        };

        let collection = self.get_collection_actor(col_model);

        // spawn client actor
        let client_id = self.next_client_id();
        let on_exit: ExitCallback = {
            let collection = collection.clone();
            Box::new(move || {
                debug!("client-{}: exit", client_id);
                _ = collection
                    .send(CollectionMessage::Unsubscribe { client_id });
            })
        };
        let client = ClientHandle::new(
            client_id,
            user,
            websocket,
            collection.clone(),
            colrev,
            Some(on_exit),
        );

        // subscribe client to collection
        _ = collection.send(CollectionMessage::Subscribe {
            client_id,
            handle: client,
        });
    }

    fn next_client_id(&mut self) -> i32 {
        self.client_id += 1;
        self.client_id
    }

    fn get_collection_actor(&mut self, col: Collection) -> CollectionHandle {
        match self.collections.get(&col.id) {
            Some(col) => col.clone(),
            None => self.spawn_collection_actor(col),
        }
    }

    async fn get_collection_actor_by_id(
        &mut self,
        id: &str,
    ) -> Result<CollectionHandle, SinkronError> {
        let mut conn = self.connect().await?;
        let col = schema::collections::table
            .find(id)
            .first::<Collection>(&mut conn)
            .await
            .map_err(|err| match err {
                diesel::NotFound => {
                    SinkronError::not_found("Collection not found")
                }
                err => SinkronError::internal(&err.to_string()),
            })?;
        Ok(self.get_collection_actor(col))
    }

    fn spawn_collection_actor(&mut self, col: Collection) -> CollectionHandle {
        let on_exit: ExitCallback = {
            let exit_sender = self.exit_channel.0.clone();
            let id = col.id.clone();
            Box::new(move || {
                _ = exit_sender.send(id);
            })
        };
        let id = col.id.clone();
        let col_handle = CollectionHandle::new(
            col,
            self.pool.clone(),
            self.groups_api.clone(),
            Some(on_exit),
        );
        self.collections.insert(id, col_handle.clone());
        col_handle
    }
}

#[derive(Clone)]
pub struct SinkronHandle {
    sender: mpsc::UnboundedSender<SinkronActorMessage>,
}

impl SinkronHandle {
    pub fn new(pool: db::DbConnectionPool, groups_api: Arc<GroupsApi>) -> Self {
        let (sender, receiver) = mpsc::unbounded_channel();
        let mut actor = SinkronActor::new(receiver, groups_api, pool);
        tokio::spawn(async move { actor.run().await });
        Self { sender }
    }

    pub fn send(
        &self,
        msg: SinkronActorMessage,
    ) -> Result<(), mpsc::error::SendError<SinkronActorMessage>> {
        self.sender.send(msg)
    }
}
