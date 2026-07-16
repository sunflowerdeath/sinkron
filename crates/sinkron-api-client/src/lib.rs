use sinkron_common::permissions::Permissions;
use sinkron_common::error::SinkronError;

pub struct SinkronClient {
    url: String,
    token: String,
}

pub struct CreateCollection {
    id: String,
    permissions: Permissions,
}

pub struct Collection {
    id: String,
    is_ref: bool,
    colrev: i64,
    permissions: Permissions,
}

pub struct Document {
    id: uuid::Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    col: String,
    colrev: i64,
    data: Option<Uint8Array>,
    permissions: Permissions,
}

impl SinkronClient {
    pub fn new(url: String, token: String) -> Self {
        Self { url, token }
    }

    pub async fn create_collection(
        props: CreateCollection,
    ) -> Result<Collection, SinkronError> {
        Err(SinkronError::internal("Not implemented")) // TODO
    }

    pub async fn get_collection(
        id: String,
    ) -> Result<Collection, SinkronError> {
        Err(SinkronError::internal("Not implemented")) // TODO
    }

    pub async fn delete_collection(id: String) -> Result<(), SinkronError> {
        Err(SinkronError::internal("Not implemented")) // TODO
    }

    pub async fn create_document() -> Result<Document, SinkronError> {
        Err(SinkronError::internal("Not implemented")) // TODO
    }

    pub async fn get_document() -> Result<Document, SinkronError> {
        Err(SinkronError::internal("Not implemented")) // TODO
    }

    pub async fn delete_document() -> Result<(), SinkronError> {
        Err(SinkronError::internal("Not implemented")) // TODO
    }

    // create_group
    //
    // get_group
    //
    // get_user
    //
    // delete_group
    //
    // add_user_to_group
    //
    // remove_user_from_group
    //
    // delete_user
    //
    // update_collection_permissions
    //
    // update_document_permissions
}
