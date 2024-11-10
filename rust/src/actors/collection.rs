use std::collections::HashMap;

use base64::prelude::*;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use log::trace;
use tokio::{
    sync::{mpsc, oneshot},
    time::{sleep, Duration},
};

use crate::api_types::Document;
use crate::actors::client::ClientHandle;
use crate::db;
use crate::error::{SinkronError, internal_error};
use crate::models;
use crate::protocol::*;
use crate::schema;
use crate::supervisor::{ExitCallback, Supervisor};

// Collection actor performs document operations over single collection,
// then replies back with results and also broadcasts messages to all
// active subscribers of the collection.

pub struct SyncResult {
    pub documents: Vec<Document>,
    pub colrev: i64,
}

pub enum CollectionMessage {
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
        reply: oneshot::Sender<Result<SyncResult, SinkronError>>,
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
    colrev: i64,
    pool: db::DbConnectionPool,
    receiver: mpsc::UnboundedReceiver<CollectionMessage>,
    subscribers: std::collections::HashMap<i32, ClientHandle>,
    timeout_task: Option<tokio::task::JoinHandle<()>>,
}

impl CollectionActor {
    fn new(
        id: String,
        colrev: i64,
        receiver: mpsc::UnboundedReceiver<CollectionMessage>,
        pool: db::DbConnectionPool,
        supervisor: Supervisor,
    ) -> Self {
        Self {
            supervisor,
            id,
            colrev,
            receiver,
            pool,
            subscribers: HashMap::new(),
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
                let res = self.sync_documents(colrev).await;
                _ = reply.send(res);
            }
            CollectionMessage::Get { id, reply } => {
                trace!("col-{}: get document, id: {}", self.id, id);
                let res = self.get_document(id).await;
                _ = reply.send(res);
            }
            CollectionMessage::Create { id, data, reply } => {
                trace!("col-{}: create, id: {}", self.id, id);
                let res = self.create_document(id, data, None).await;
                _ = reply.send(res);
            }
            CollectionMessage::Update { id, data, reply } => {
                trace!("col-{}: update, id: {}", self.id, id);
                let res = self.update_document(id, Some(data)).await;
                _ = reply.send(res);
            }
            CollectionMessage::Delete { id, reply } => {
                trace!("col-{}: delete, id: {}", self.id, id);
                let res = self.update_document(id, None).await;
                _ = reply.send(res);
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
            .map_err(internal_error)?;
        Ok(colrev)
    }

    async fn broadcast(&self, msg: ServerMessage) {
        // TODO more efficient ?
        for client in self.subscribers.values() {
            client.send_message(msg.clone()).await;
        }
    }

    fn doc_from_model(doc: models::Document) -> Document {
        Document {
            id: doc.id,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
            data: doc.data.map(|data| BASE64_STANDARD.encode(data)),
            col: doc.col_id,
            colrev: doc.colrev,
            permissions: doc.permissions,
        }
    }

    async fn sync_documents(
        &self,
        colrev: Option<i64>,
    ) -> Result<SyncResult, SinkronError> {
        let mut conn = self.connect().await?;
        let req_base = schema::documents::table
            .filter(schema::documents::col_id.eq(&self.id))
            .into_boxed();
        let req = match colrev {
            Some(colrev) => {
                // select docs since colrev, including deleted
                req_base.filter(schema::documents::colrev.gt(colrev))
            }
            None => {
                // select all doc, except deleted
                req_base.filter(schema::documents::is_deleted.eq(false))
            }
        };
        let documents: Vec<models::Document> =
            req.get_results(&mut conn).await.map_err(internal_error)?;
        Ok(SyncResult {
            documents: documents
                .into_iter()
                .map(Self::doc_from_model)
                .collect(),
            colrev: 0,
        })
    }

    async fn create_document(
        &self,
        id: uuid::Uuid,
        data: String,
        permissions: Option<String>,
    ) -> Result<Document, SinkronError> {
        let mut conn = self.connect().await?;

        let cnt: i64 = schema::documents::table
            .filter(schema::documents::id.eq(&id))
            .count()
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;
        if cnt != 0 {
            return Err(SinkronError::unprocessable("Duplicate document id"));
        }

        // TODO check collection is_ref

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

        let msg = ServerChangeMessage {
            id,
            col: self.id.clone(),
            colrev: next_colrev,
            op: Op::Create,
            data: Some(data.clone()),
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
            changeid: "".to_string(), // TODO payload.changeid
        };
        self.broadcast(ServerMessage::Change(msg)).await;

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
            .filter(schema::documents::col_id.eq(&self.id))
            .first(&mut conn)
            .await
            .map_err(|err| match err {
                diesel::NotFound => {
                    SinkronError::not_found("Document not found")
                }
                err => SinkronError::internal(&err.to_string()),
            })?;

        Ok(Self::doc_from_model(doc))
    }

    async fn update_document(
        &self,
        id: uuid::Uuid,
        update: Option<String>,
    ) -> Result<Document, SinkronError> {
        let mut conn = self.connect().await?;

        let doc: models::Document = schema::documents::table
            .find(id)
            .filter(schema::documents::col_id.eq(&self.id))
            .first(&mut conn)
            .await
            .map_err(|err| match err {
                diesel::NotFound => {
                    SinkronError::not_found("Document not found")
                }
                err => SinkronError::internal(&err.to_string()),
            })?;

        let new_data = match &update {
            Some(update) => {
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
                    return Err(SinkronError::bad_request(
                        "Couldn't import update",
                    ));
                }
                let Ok(snapshot) = loro_doc.export(loro::ExportMode::Snapshot)
                else {
                    return Err(SinkronError::bad_request(
                        "Couldn't export snapshot",
                    ));
                };

                Some(snapshot)
            }
            None => {
                if doc.data.is_none() {
                    return Err(SinkronError::unprocessable(
                        "Document is already deleted",
                    ));
                };
                None
            }
        };

        let next_colrev = self.increment_colrev().await?;

        // TODO increment refs colrev

        let doc_update = models::DocumentUpdate {
            colrev: next_colrev,
            is_deleted: update.is_none(),
            data: new_data.as_ref(),
        };

        let updated_at: chrono::DateTime<chrono::Utc> =
            diesel::update(schema::documents::table)
                .filter(schema::documents::id.eq(&id))
                .set(doc_update)
                .returning(schema::documents::updated_at)
                .get_result(&mut conn)
                .await
                .map_err(internal_error)?;

        let serialized_new_data = new_data.map(|d| BASE64_STANDARD.encode(d));

        // broadcast message to subscribers
        let op = if update.is_some() {
            Op::Update
        } else {
            Op::Delete
        };
        let msg = ServerChangeMessage {
            id,
            col: self.id.clone(),
            colrev: next_colrev,
            op,
            data: serialized_new_data.clone(),
            created_at: doc.created_at.clone(),
            updated_at: updated_at.clone(),
            changeid: "".to_string(), // TODO payload.changeid
        };
        self.broadcast(ServerMessage::Change(msg)).await;

        let updated_doc = Document {
            id: doc.id,
            created_at: doc.created_at,
            updated_at,
            data: serialized_new_data,
            col: doc.col_id,
            colrev: next_colrev,
            permissions: doc.permissions,
        };
        Ok(updated_doc)
    }
}

#[derive(Clone)]
pub struct CollectionHandle {
    pub id: String,
    sender: mpsc::UnboundedSender<CollectionMessage>,
    pub supervisor: Supervisor,
}

impl CollectionHandle {
    pub fn new(
        id: String,
        colrev: i64,
        pool: db::DbConnectionPool,
        on_exit: Option<ExitCallback>,
    ) -> Self {
        let (sender, receiver) = mpsc::unbounded_channel();
        let supervisor = Supervisor::new();
        let mut actor = CollectionActor::new(
            id.clone(),
            colrev,
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

    pub fn send(
        &self,
        msg: CollectionMessage,
    ) -> Result<(), mpsc::error::SendError<CollectionMessage>> {
        self.sender.send(msg)
    }
}
