use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use axum::extract::ws::WebSocket;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use log::debug;
use tokio::select;
use tokio::sync::{mpsc, oneshot};

use sinkron_common::error::{SinkronError, internal_error};
use sinkron_common::types::Collection;

use crate::actors::client::ClientHandle;
use crate::actors::collection::CollectionHandle;
use crate::actors::supervisor::ExitCallback;
use crate::controllers::SinkronControllers;
use crate::db::{Db, DbConnection};
use crate::schema;
use crate::models;

pub struct ConnectMessage {
    pub websocket: WebSocket,
    pub user_id: String,
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
    self_handle: SinkronHandle,
    receiver: mpsc::UnboundedReceiver<SinkronActorMessage>,
    client_id: i32,
    collections: HashMap<String, CollectionHandle>,
    db: Db,
    controller_cell: OnceLock<Arc<SinkronControllers>>,
    exit_channel: (
        mpsc::UnboundedSender<String>,
        mpsc::UnboundedReceiver<String>,
    ),
}

impl SinkronActor {
    fn new(
        self_handle: SinkronHandle,
        receiver: mpsc::UnboundedReceiver<SinkronActorMessage>,
        db: Db,
        controller_cell: OnceLock<Arc<SinkronControllers>>,
    ) -> Self {
        Self {
            self_handle,
            receiver,
            client_id: 0,
            db,
            controller_cell,
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

    async fn connect(&self) -> Result<DbConnection, SinkronError> {
        self.db.get().await.map_err(internal_error)
    }

    async fn handle_connect(&mut self, msg: ConnectMessage) {
        let ConnectMessage { websocket, user_id } = msg;

        debug!("sinkron: client connect, user_id: {}", user_id);
        ClientHandle::new(
            self.next_client_id(),
            user_id,
            websocket,
            self.self_handle.clone(),
        );
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
            .first::<models::Collection>(&mut conn)
            .await
            .map_err(|err| match err {
                diesel::NotFound => {
                    SinkronError::not_found("Collection not found")
                }
                err => SinkronError::internal(&err.to_string()),
            })?;
        Ok(self.get_collection_actor(col.into()))
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
            self.db.clone(),
            self.controller_cell.get().unwrap().clone(),
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
    pub fn new(
        db: Db,
        controller_cell: OnceLock<Arc<SinkronControllers>>,
    ) -> Self {
        let (sender, receiver) = mpsc::unbounded_channel();
        let handle = Self { sender };
        let mut actor =
            SinkronActor::new(handle.clone(), receiver, db, controller_cell);
        tokio::spawn(async move { actor.run().await });
        handle
    }

    pub fn send(
        &self,
        msg: SinkronActorMessage,
    ) -> Result<(), mpsc::error::SendError<SinkronActorMessage>> {
        self.sender.send(msg)
    }

    pub async fn get_collection_actor(
        &self,
        col: String,
    ) -> Result<CollectionHandle, SinkronError> {
        let (sender, receiver) = oneshot::channel();
        let get_msg = GetCollectionMessage { col, reply: sender };
        self.send(SinkronActorMessage::GetCollection(get_msg))
            .expect("SinkronActor shoudn't exit");
        receiver.await.map_err(internal_error)?
    }
}
