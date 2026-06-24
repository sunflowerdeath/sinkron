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
    created_at: Date,
    updated_at: Date,
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
    }

    pub async fn get_collection(
        id: String,
    ) -> Result<Collection, SinkronError> {
    }

    pub async fn delete_collection(id: String) -> Result<(), SinkronError> {}

    pub async fn create_document() -> Result<Document, SinkronError> {}

    pub async fn get_document() -> Result<Document, SinkronError> {}

    pub async fn delete_document() -> Result<(), SinkronError> {}

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
