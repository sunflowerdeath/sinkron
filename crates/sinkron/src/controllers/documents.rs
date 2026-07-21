use tokio::sync::oneshot;

use sinkron_common::error::{SinkronError, internal_error};
use sinkron_common::types::{
    CreateDocument, DeleteDocument, Document, GetDocument, UpdateDocument,
};

use crate::actors::collection;
use crate::actors::collection::CollectionMessage;
use crate::actors::sinkron::SinkronHandle;

pub struct DocumentsController {
    sinkron_actor: SinkronHandle,
}

impl DocumentsController {
    pub fn new(sinkron_actor: SinkronHandle) -> Self {
        DocumentsController { sinkron_actor }
    }

    pub async fn get_document(
        &self,
        props: GetDocument,
    ) -> Result<Document, SinkronError> {
        let GetDocument { id, col } = props;
        let col_actor = self.sinkron_actor.get_collection_actor(col).await?;
        let (sender, receiver) = oneshot::channel();
        col_actor
            .send(CollectionMessage::Get(collection::GetMessage {
                id,
                source: collection::Source::Api,
                reply: sender,
            }))
            .map_err(internal_error)?;
        receiver.await.map_err(internal_error)?
    }

    pub async fn create_document(
        &self,
        props: CreateDocument,
    ) -> Result<Document, SinkronError> {
        let CreateDocument {
            id,
            col,
            content,
            files,
            permissions: _, // TODO permissions
        } = props;
        let col_actor = self.sinkron_actor.get_collection_actor(col).await?;
        let (sender, receiver) = oneshot::channel();
        col_actor
            .send(CollectionMessage::Create(collection::CreateMessage {
                id,
                content,
                files,
                source: collection::Source::Api,
                reply: sender,
            }))
            .map_err(internal_error)?;
        receiver.await.map_err(internal_error)?
    }

    pub async fn update_document(
        &self,
        props: UpdateDocument,
    ) -> Result<Document, SinkronError> {
        let UpdateDocument {
            id,
            col,
            content_update,
            files_update,
        } = props;
        let col_actor = self.sinkron_actor.get_collection_actor(col).await?;
        let (sender, receiver) = oneshot::channel();
        col_actor
            .send(CollectionMessage::Update(collection::UpdateMessage {
                id,
                content_update,
                files_update,
                source: collection::Source::Api,
                reply: sender,
            }))
            .map_err(internal_error)?;
        receiver.await.map_err(internal_error)?
    }

    pub async fn delete_document(
        &self,
        props: DeleteDocument,
    ) -> Result<Document, SinkronError> {
        let DeleteDocument { id, col } = props;
        let col_actor = self.sinkron_actor.get_collection_actor(col).await?;
        let (sender, receiver) = oneshot::channel();
        col_actor
            .send(CollectionMessage::Delete(collection::DeleteMessage {
                id,
                source: collection::Source::Api,
                reply: sender,
            }))
            .map_err(internal_error)?;
        receiver.await.map_err(internal_error)?
    }
}
