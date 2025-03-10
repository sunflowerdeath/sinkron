use std::collections::HashMap;
use std::sync::Arc;

use base64::prelude::*;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use log::{debug, trace};
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

use crate::actors::client::{ClientActorMessage, ClientHandle};
use crate::actors::supervisor::{ExitCallback, Supervisor};
use crate::db;
use crate::error::{internal_error, SinkronError};
use crate::groups::GroupsApi;
use crate::models;
use crate::permissions::{Action, Permissions};
use crate::protocol::*;
use crate::schema;
use crate::types::{Collection, Document};

// Collection actor performs document operations over single collection,
// then replies back with results and also broadcasts messages to all
// active subscribers of the collection.

pub struct SyncResult {
    pub documents: Vec<Document>,
    pub colrev: i64,
}

pub enum Source {
    Client { user: String },
    Api,
}

pub struct SyncMessage {
    pub colrev: i64,
    pub reply: oneshot::Sender<Result<SyncResult, SinkronError>>,
    pub source: Source,
}

pub struct GetMessage {
    pub id: Uuid,
    pub source: Source,
    pub reply: oneshot::Sender<Result<Document, SinkronError>>,
}

pub struct CreateMessage {
    pub id: Uuid,
    pub data: String,
    pub source: Source,
    pub changeid: Uuid,
    pub reply: oneshot::Sender<Result<Document, SinkronError>>,
}

pub struct UpdateMessage {
    pub id: Uuid,
    pub data: String,
    pub source: Source,
    pub changeid: Uuid,
    pub reply: oneshot::Sender<Result<Document, SinkronError>>,
}

pub struct DeleteMessage {
    pub id: Uuid,
    pub source: Source,
    pub changeid: Uuid,
    pub reply: oneshot::Sender<Result<Document, SinkronError>>,
}

pub enum CollectionMessage {
    Subscribe {
        client_id: i32,
        handle: ClientHandle,
    },
    Unsubscribe {
        client_id: i32,
    },
    Sync(SyncMessage),
    Get(GetMessage),
    Create(CreateMessage),
    Update(UpdateMessage),
    Delete(DeleteMessage),
}

struct CollectionState {
    colrev: i64,
    permissions: Permissions,
}

impl CollectionState {
    fn new(col: &Collection) -> Self {
        Self {
            colrev: col.colrev,
            permissions: Permissions::parse_or_empty(&col.permissions),
        }
    }
}

struct CollectionActor {
    supervisor: Supervisor,
    id: String,
    state: CollectionState,
    pool: db::DbConnectionPool,
    groups_api: Arc<GroupsApi>,
    receiver: mpsc::UnboundedReceiver<CollectionMessage>,
    subscribers: std::collections::HashMap<i32, ClientHandle>,
}

impl CollectionActor {
    fn new(
        id: String,
        state: CollectionState,
        receiver: mpsc::UnboundedReceiver<CollectionMessage>,
        pool: db::DbConnectionPool,
        groups_api: Arc<GroupsApi>,
        supervisor: Supervisor,
    ) -> Self {
        Self {
            supervisor,
            id,
            state,
            receiver,
            pool,
            groups_api,
            subscribers: HashMap::new(),
        }
    }

    async fn run(&mut self) {
        debug!("col-{}: actor start", self.id);
        while let Some(msg) = self.receiver.recv().await {
            self.handle_message(msg).await;
        }
        debug!("col-{}: actor exit", self.id);
    }

    async fn check_col_permission(
        &self,
        source: Source,
        action: Action,
    ) -> Result<(), SinkronError> {
        match source {
            Source::Api => Ok(()),
            Source::Client { user } => {
                let user = self.groups_api.get_user(user).await?;
                if self.state.permissions.check(&user, action) {
                    Ok(())
                } else {
                    Err(SinkronError::forbidden("Operation is forbidden"))
                }
            }
        }
    }

    async fn check_doc_permission(
        &self,
        doc: &models::Document,
        source: Source,
        action: Action,
    ) -> Result<(), SinkronError> {
        match source {
            Source::Api => Ok(()),
            Source::Client { user } => {
                let user = self.groups_api.get_user(user).await?;
                let permissions: Permissions =
                    serde_json::from_str(&doc.permissions).map_err(|_| {
                        SinkronError::internal(
                        "Couldn't parse permissions, data might be corrupted")
                    })?;
                if permissions.check(&user, action) {
                    Ok(())
                } else {
                    Err(SinkronError::forbidden("Operation is forbidden"))
                }
            }
        }
    }

    async fn handle_message(&mut self, msg: CollectionMessage) {
        match msg {
            CollectionMessage::Subscribe { client_id, handle } => {
                self.handle_subscribe(client_id, handle);
                debug!("col-{}: client subscribed, id: {}", self.id, client_id);
            }
            CollectionMessage::Unsubscribe { client_id } => {
                self.handle_unsubscribe(client_id);
                debug!(
                    "col-{}: client unsubscribed, id: {}",
                    self.id, client_id
                );
            }
            CollectionMessage::Sync(msg) => {
                let SyncMessage {
                    colrev,
                    source,
                    reply,
                } = msg;
                trace!("col-{}: sync, colrev: {:?}", self.id, colrev);
                let res = self.handle_sync(colrev, source).await;
                _ = reply.send(res);
            }
            CollectionMessage::Get(msg) => {
                let GetMessage { id, source, reply } = msg;
                trace!("col-{}: get document, id: {}", self.id, id);
                let res = self.handle_get(id, source).await;
                _ = reply.send(res);
            }
            CollectionMessage::Create(msg) => {
                let CreateMessage {
                    id,
                    data,
                    source,
                    changeid,
                    reply,
                } = msg;
                trace!("col-{}: create, id: {}", self.id, id);
                let res = self.handle_create(id, data, source, changeid).await;
                _ = reply.send(res);
            }
            CollectionMessage::Update(msg) => {
                let UpdateMessage {
                    id,
                    data,
                    source,
                    changeid,
                    reply,
                } = msg;
                trace!("col-{}: update, id: {}", self.id, id);
                let res = self
                    .handle_update(id, Some(data.clone()), source, changeid)
                    .await;
                _ = reply.send(res);
            }
            CollectionMessage::Delete(msg) => {
                let DeleteMessage {
                    id,
                    source,
                    changeid,
                    reply,
                } = msg;
                trace!("col-{}: delete, id: {}", self.id, id);
                let res = self.handle_update(id, None, source, changeid).await;
                _ = reply.send(res);
            }
        }
    }

    fn handle_subscribe(&mut self, id: i32, handle: ClientHandle) {
        self.subscribers.insert(id, handle);
    }

    fn handle_unsubscribe(&mut self, id: i32) {
        self.subscribers.remove(&id);
        if self.subscribers.is_empty() {
            debug!("col-{}: last client unsubscribed", self.id);
            self.supervisor.stop();
        }
    }

    async fn connect(&self) -> Result<db::DbConnection, SinkronError> {
        self.pool.get().await.map_err(internal_error)
    }

    async fn increment_colrev(
        &mut self,
        conn: &mut db::DbConnection,
    ) -> Result<i64, SinkronError> {
        use schema::collections;
        let colrev: i64 = diesel::update(collections::table)
            .filter(collections::id.eq(&self.id))
            .set(collections::colrev.eq(collections::colrev + 1))
            .returning(collections::colrev)
            .get_result(conn)
            .await
            .map_err(internal_error)?;
        self.state.colrev = colrev;
        Ok(colrev)
    }

    fn broadcast(&self, msg: ServerMessage) {
        if let Ok(serialized) = serde_json::to_string(&msg) {
            for client in self.subscribers.values() {
                // XXX should handle if it couldn't write to client
                // should unsubscribe and stop it
                client.send(ClientActorMessage::Raw(serialized.clone()));
            }
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

    async fn handle_sync(
        &self,
        colrev: i64,
        source: Source,
    ) -> Result<SyncResult, SinkronError> {
        self.check_col_permission(source, Action::Read).await?;

        if colrev > self.state.colrev {
            return Err(SinkronError::unprocessable("Invalid colrev"));
        }

        if colrev == self.state.colrev {
            return Ok(SyncResult {
                documents: Vec::new(),
                colrev: self.state.colrev,
            });
        }

        let mut conn = self.connect().await?;
        let req_base = schema::documents::table
            .filter(schema::documents::col_id.eq(&self.id))
            .order(schema::documents::created_at.asc())
            .into_boxed();
        let req = if colrev == 0 {
            // select all doc, except deleted
            req_base.filter(schema::documents::is_deleted.eq(false))
        } else {
            // select docs since colrev, including deleted
            req_base.filter(schema::documents::colrev.gt(colrev))
        };
        let documents: Vec<models::Document> =
            req.get_results(&mut conn).await.map_err(internal_error)?;

        Ok(SyncResult {
            documents: documents
                .into_iter()
                .map(Self::doc_from_model)
                .collect(),
            colrev: self.state.colrev,
        })
    }

    async fn handle_get(
        &self,
        id: Uuid,
        source: Source,
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
        drop(conn);

        self.check_doc_permission(&doc, source, Action::Read)
            .await?;

        Ok(Self::doc_from_model(doc))
    }

    async fn handle_create(
        &mut self,
        id: Uuid,
        data: String,
        source: Source,
        changeid: Uuid,
    ) -> Result<Document, SinkronError> {
        self.check_col_permission(source, Action::Create).await?;

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

        // increment colrev
        let next_colrev = self.increment_colrev(&mut conn).await?;

        // create document
        // TODO create document with different permissions that col
        let permissions = self.state.permissions.to_string();
        let new_doc = models::NewDocument {
            id,
            col_id: self.id.clone(),
            colrev: next_colrev,
            data: decoded,
            permissions: &permissions,
        };
        let created_at: chrono::DateTime<chrono::Utc> =
            diesel::insert_into(schema::documents::table)
                .values(&new_doc)
                .returning(schema::documents::created_at)
                .get_result(&mut conn)
                .await
                .map_err(internal_error)?;

        drop(conn);

        let msg = ServerChangeMessage {
            id,
            col: self.id.clone(),
            colrev: next_colrev,
            op: Op::Create,
            data: Some(data.clone()),
            created_at,
            updated_at: created_at,
            changeid,
        };
        self.broadcast(ServerMessage::Change(msg));

        // return document
        let doc = Document {
            id,
            created_at,
            updated_at: created_at,
            data: Some(data),
            col: self.id.clone(),
            colrev: next_colrev,
            permissions,
        };

        Ok(doc)
    }

    async fn update_loro_doc(
        &self,
        snapshot: Vec<u8>,
        update: &str,
    ) -> Result<Vec<u8>, SinkronError> {
        let Ok(decoded_update) = BASE64_STANDARD.decode(update) else {
            return Err(SinkronError::bad_request(
                "Couldn't decode update from base64",
            ));
        };
        let task = tokio::task::spawn_blocking(move || {
            let loro_doc = loro::LoroDoc::new();
            if loro_doc.import(&snapshot).is_err() {
                return Err(SinkronError::internal(
                    "Couldn't import snapshot, data might be corrupted",
                ));
            }
            if loro_doc.import(&decoded_update).is_err() {
                return Err(SinkronError::bad_request(
                    "Couldn't import update",
                ));
            }
            loro_doc.export(loro::ExportMode::Snapshot).map_err(|_| {
                SinkronError::bad_request("Couldn't export snapshot")
            })
        });
        let res =
            tokio::time::timeout(tokio::time::Duration::from_millis(500), task)
                .await;
        match res {
            Ok(Ok(res)) => res,
            Ok(Err(_)) => {
                panic!("Couldn't join update task!")
            }
            Err(_) => {
                panic!("Update task timeout!")
            }
        }
    }

    async fn handle_update(
        &mut self,
        id: Uuid,
        data: Option<String>,
        source: Source,
        changeid: Uuid,
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
        drop(conn);

        let is_delete = data.is_none();
        let action = if is_delete {
            Action::Delete
        } else {
            Action::Update
        };
        self.check_doc_permission(&doc, source, action).await?;

        let new_data = match &data {
            Some(update) => {
                let Some(data) = doc.data else {
                    return Err(SinkronError::unprocessable(
                        "Couldn't update deleted document",
                    ));
                };
                Some(self.update_loro_doc(data, &update).await?)
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

        let mut conn = self.connect().await?;

        // Increment colrev
        let next_colrev = self.increment_colrev(&mut conn).await?;

        // TODO increment refs colrev

        // Update document
        let doc_update = models::DocumentUpdate {
            colrev: next_colrev,
            is_deleted: is_delete,
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

        drop(conn);

        let serialized_new_data = new_data.map(|d| BASE64_STANDARD.encode(d));

        // Broadcast message to subscribers
        let op = if is_delete { Op::Delete } else { Op::Update };
        let msg = ServerChangeMessage {
            id,
            col: self.id.clone(),
            colrev: next_colrev,
            op,
            data: serialized_new_data.clone(),
            created_at: doc.created_at,
            updated_at,
            changeid,
        };
        self.broadcast(ServerMessage::Change(msg));

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
    #[allow(dead_code)]
    pub supervisor: Supervisor,
}

impl CollectionHandle {
    pub fn new(
        col: Collection,
        pool: db::DbConnectionPool,
        groups_api: Arc<GroupsApi>,
        on_exit: Option<ExitCallback>,
    ) -> Self {
        let state = CollectionState::new(&col);

        let (sender, receiver) = mpsc::unbounded_channel();
        let supervisor = Supervisor::new();
        let mut actor = CollectionActor::new(
            col.id.clone(),
            state,
            receiver,
            pool,
            groups_api,
            supervisor.clone(),
        );
        let name = format!("collection:{}", &col.id);
        supervisor.spawn(name, async move { actor.run().await }, on_exit);
        CollectionHandle {
            id: col.id.clone(),
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
