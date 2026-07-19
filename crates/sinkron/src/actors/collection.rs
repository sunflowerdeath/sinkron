use std::collections::HashMap;
use std::sync::Arc;

use base64::prelude::*;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use log::{debug, trace};
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

use sinkron_common::error::{SinkronError, internal_error};
use sinkron_common::permissions::{Action, Permissions};
use sinkron_common::types::{Collection, Document};
use sinkron_common::protocol::*;

use crate::actors::client::ClientChannelSender;
use crate::actors::supervisor::{ExitCallback, Supervisor};
use crate::controllers::SinkronControllers;
use crate::db::{Db, DbConnection};
use crate::models;
use crate::schema;

// Collection actor performs document operations over single collection,
// then replies back with results and also broadcasts messages to all
// active subscribers of the collection.

pub struct SyncResult {
    pub documents: Vec<Document>,
    pub colrev: i64,
    pub subscriber_id: i32,
}

pub enum Source {
    Client { user: String },
    Api,
}

pub struct SyncMessage {
    pub colrev: i64,
    pub source: Source,
    pub reply: oneshot::Sender<Result<SyncResult, SinkronError>>,
    pub updates: ClientChannelSender,
}

pub struct SyncStopMessage {
    pub subscriber_id: i32,
}

pub struct GetMessage {
    pub id: Uuid,
    pub source: Source,
    pub reply: oneshot::Sender<Result<Document, SinkronError>>,
}

pub struct CreateMessage {
    pub id: Uuid,
    pub content: String,
    pub files: Vec<Uuid>,
    pub source: Source,
    pub reply: oneshot::Sender<Result<Document, SinkronError>>,
}

pub struct UpdateMessage {
    pub id: Uuid,
    pub content_update: Option<String>,
    pub files_update: Option<FilesUpdate>,
    pub source: Source,
    pub reply: oneshot::Sender<Result<Document, SinkronError>>,
}

pub struct DeleteMessage {
    pub id: Uuid,
    pub source: Source,
    pub reply: oneshot::Sender<Result<Document, SinkronError>>,
}

pub enum CollectionMessage {
    Sync(SyncMessage),
    SyncStop(SyncStopMessage),
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
    db: Db,
    controller: Arc<SinkronControllers>,
    receiver: mpsc::UnboundedReceiver<CollectionMessage>,
    subscriber_id: i32,
    subscribers: std::collections::HashMap<i32, ClientChannelSender>,
}

impl CollectionActor {
    fn new(
        id: String,
        state: CollectionState,
        receiver: mpsc::UnboundedReceiver<CollectionMessage>,
        db: Db,
        controller: Arc<SinkronControllers>,
        supervisor: Supervisor,
    ) -> Self {
        Self {
            supervisor,
            id,
            state,
            receiver,
            db,
            controller,
            subscriber_id: 0,
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
                let user = self.controller.groups.get_user(user).await?;
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
                let user = self.controller.groups.get_user(user).await?;
                let permissions: Permissions = serde_json::from_str(
                    &doc.permissions,
                )
                .map_err(|_| {
                    SinkronError::internal(
                        "Couldn't parse permissions, data might be corrupted",
                    )
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
            CollectionMessage::Sync(msg) => {
                let SyncMessage {
                    colrev,
                    source,
                    reply,
                    updates,
                } = msg;
                trace!("col-{}: sync, colrev: {:?}", self.id, colrev);
                let res = self.handle_sync(colrev, source, updates).await;
                _ = reply.send(res.map_err(Into::into));
            }
            CollectionMessage::SyncStop(msg) => {
                let SyncStopMessage { subscriber_id } = msg;
                self.handle_sync_stop(subscriber_id);
                debug!(
                    "col-{}: client unsubscribed, id: {}",
                    self.id,
                    123 // TODO client_id
                );
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
                    source,
                    content,
                    files,
                    reply,
                } = msg;
                trace!("col-{}: create, id: {}", self.id, id);
                let res = self.handle_create(id, content, files, source).await;
                _ = reply.send(res);
            }
            CollectionMessage::Update(msg) => {
                let UpdateMessage {
                    id,
                    source,
                    content_update,
                    files_update,
                    reply,
                } = msg;
                trace!("col-{}: update, id: {}", self.id, id.clone());
                let res = self
                    .handle_update(id, source, content_update, files_update)
                    .await;
                _ = reply.send(res);
            }
            CollectionMessage::Delete(msg) => {
                let DeleteMessage { id, source, reply } = msg;
                trace!("col-{}: delete, id: {}", self.id, id);
                let res = self.handle_delete(id, source).await;
                _ = reply.send(res);
            }
        }
    }

    async fn connect(&self) -> Result<DbConnection, SinkronError> {
        self.db.get().await.map_err(internal_error)
    }

    async fn increment_colrev(
        &mut self,
        conn: &mut DbConnection,
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
            for sub in self.subscribers.values() {
                // XXX should handle if it couldn't write to client
                // should unsubscribe and stop it
                sub.send_raw(serialized.clone());
            }
        }
    }

    fn doc_from_model(doc: models::Document) -> Document {
        Document {
            id: doc.id,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
            content: doc.content.map(|content| BASE64_STANDARD.encode(content)),
            col: doc.col_id,
            colrev: doc.colrev,
            permissions: doc.permissions,
        }
    }

    fn add_subscriber(&mut self, handle: ClientChannelSender) -> i32 {
        self.subscriber_id += 1;
        self.subscribers.insert(self.subscriber_id, handle);
        self.subscriber_id
    }

    async fn handle_sync(
        &mut self,
        colrev: i64,
        source: Source,
        handle: ClientChannelSender,
    ) -> Result<SyncResult, SinkronError> {
        self.check_col_permission(source, Action::Read).await?;

        if colrev > self.state.colrev {
            return Err(SinkronError::InvalidColrev);
        }

        if colrev == self.state.colrev {
            let subscriber_id = self.add_subscriber(handle);
            return Ok(SyncResult {
                documents: Vec::new(),
                colrev: self.state.colrev,
                subscriber_id,
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

        let subscriber_id = self.add_subscriber(handle);
        Ok(SyncResult {
            documents: documents
                .into_iter()
                .map(Self::doc_from_model)
                .collect(),
            colrev: self.state.colrev,
            subscriber_id,
        })
    }

    fn handle_sync_stop(&mut self, subscriber_id: i32) {
        self.subscribers.remove(&subscriber_id);
        if self.subscribers.is_empty() {
            debug!("col-{}: last client unsubscribed", self.id);
            self.supervisor.stop();
        }
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
        content: String,
        files: Vec<Uuid>,
        source: Source,
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
            return Err(SinkronError::DuplicateDocumentId);
        }

        // TODO check collection is_ref

        // TODO create files
        // self.controller.files.create_files().await;

        let decoded = BASE64_STANDARD.decode(&content).map_err(|_| {
            SinkronError::bad_request("Couldn't decode content from base64")
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
            content: decoded,
            files: Vec::new(), // TODO files
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

        let msg = DocMessage {
            id,
            col: self.id.clone(),
            colrev: next_colrev,
            content: content.clone(),
            files: Vec::new(), // TODO files
            created_at,
            updated_at: created_at,
        };
        self.broadcast(ServerMessage::Doc(msg));

        // return document
        let doc = Document {
            id,
            created_at,
            updated_at: created_at,
            content: Some(content),
            // TODO files
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

    async fn handle_delete(
        &mut self,
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

        self.check_doc_permission(&doc, source, Action::Delete)
            .await?;

        if doc.is_deleted {
            return Err(SinkronError::DocumentAlreadyDeleted);
        }

        // Increment colrev
        let next_colrev = self.increment_colrev(&mut conn).await?;

        // TODO increment refs colrev

        // Update document
        let files = Some(Vec::new());
        let doc_update = models::DocumentUpdate {
            colrev: next_colrev,
            is_deleted: true,
            content: Some(None),
            files: files.as_ref(),
        };
        let updated_at: chrono::DateTime<chrono::Utc> =
            diesel::update(schema::documents::table)
                .filter(schema::documents::id.eq(&id))
                .set(doc_update)
                .returning(schema::documents::updated_at)
                .get_result(&mut conn)
                .await
                .map_err(internal_error)?;

        // Broadcast message to subscribers
        let msg = ServerDeleteMessage {
            id,
            col: self.id.clone(),
            colrev: next_colrev,
        };
        self.broadcast(ServerMessage::Delete(msg));

        let deleted_doc = Document {
            id: doc.id,
            created_at: doc.created_at,
            updated_at,
            content: Some("".to_string()), // correct new content or old content
            // files: Vec::new(), // TODO
            col: doc.col_id,
            colrev: next_colrev,
            permissions: doc.permissions,
        };
        Ok(deleted_doc)
    }

    async fn handle_update(
        &mut self,
        id: Uuid,
        source: Source,
        content_update: Option<String>,
        files_update: Option<FilesUpdate>,
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
        // drop(conn); TODO Why drop?

        self.check_doc_permission(&doc, source, Action::Update)
            .await?;

        if doc.is_deleted {
            return Err(SinkronError::DocumentAlreadyDeleted);
        }

        let content_update_value = match &content_update {
            Some(update) => {
                let doc_content = doc.content.unwrap();
                Some(Some(self.update_loro_doc(doc_content, &update).await?))
            }
            None => None,
        };

        let files_update_value = match files_update {
            Some(files_update) => {
                // TODO actually update files
                Some(Vec::<Uuid>::new())
            }
            None => None,
        };

        // Increment colrev
        let next_colrev = self.increment_colrev(&mut conn).await?;

        // TODO increment refs colrev

        // Update document
        let doc_update = models::DocumentUpdate {
            colrev: next_colrev,
            is_deleted: false,
            content: content_update_value.as_ref().map(|i| i.as_ref()),
            files: files_update_value.as_ref(),
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

        // Broadcast message to subscribers
        let msg = ServerUpdateMessage {
            id,
            col: self.id.clone(),
            colrev: next_colrev,
            content_update,
            files: files_update_value.unwrap_or(Vec::new()),
            // TODO OR doc.files (but correctly filter)
            created_at: doc.created_at,
            updated_at,
        };
        self.broadcast(ServerMessage::Update(msg));

        // let serialized_new_content =
        // content_update.map(|d| BASE64_STANDARD.encode(d));

        let updated_doc = Document {
            id: doc.id,
            created_at: doc.created_at,
            updated_at,
            content: Some("".to_string()), // correct new data or old data
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
        db: Db,
        controller: Arc<SinkronControllers>,
        on_exit: Option<ExitCallback>,
    ) -> Self {
        let state = CollectionState::new(&col);

        let (sender, receiver) = mpsc::unbounded_channel();
        let supervisor = Supervisor::new();
        let mut actor = CollectionActor::new(
            col.id.clone(),
            state,
            receiver,
            db,
            controller,
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
