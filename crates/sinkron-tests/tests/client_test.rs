use base64::prelude::*;
use loro::LoroDoc;
use uuid::Uuid;

use sinkron_client::{ClientError, SinkronClient};
use sinkron_common::error::SinkronError;
use sinkron_common::permissions::Permissions;
use sinkron_common::types::{
    Collection, CreateCollection, CreateDocument, DeleteDocument, Document,
    GetDocument, UpdateDocument,
};

const API_URL: &'static str = "http://localhost:3000";
const API_TOKEN: &'static str = "SINKRON_API_TOKEN";

const INVALID_API_URL: &'static str = "http://invalid_url";
const INVALID_API_TOKEN: &'static str = "INVALID_API_TOKEN";

fn test_loro_doc() -> String {
    let loro_doc = LoroDoc::new();
    loro_doc.get_text("text").insert(0, "Hello!").unwrap();
    let snapshot = loro_doc.export(loro::ExportMode::Snapshot).unwrap();
    BASE64_STANDARD.encode(snapshot)
}

#[tokio::test]
async fn test_auth() {
    let client =
        SinkronClient::new(INVALID_API_URL.to_string(), API_TOKEN.to_string());
    let res = client
        .create_collection(CreateCollection {
            id: Uuid::new_v4().to_string(),
            is_ref: false,
            permissions: Permissions::empty().to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(matches!(res, Err(ClientError::Request(_))));

    let client =
        SinkronClient::new(API_URL.to_string(), INVALID_API_TOKEN.to_string());
    let res = client
        .create_collection(CreateCollection {
            id: Uuid::new_v4().to_string(),
            is_ref: false,
            permissions: Permissions::empty().to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(matches!(
        res,
        Err(ClientError::Sinkron(SinkronError::AuthFailed { .. }))
    ));
}

#[tokio::test]
async fn test_collections() {
    let client = SinkronClient::new(API_URL.to_string(), API_TOKEN.to_string());

    let col = Uuid::new_v4().to_string();

    // create collection
    let res = client
        .create_collection(CreateCollection {
            id: col.clone(),
            is_ref: false,
            permissions: Permissions::empty().to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(matches!(
        res,
        Ok(Collection {
            id,
            colrev: 0,
            is_ref: false,
            ..
        }) if id == col
    ));

    // create duplicate col
    let res = client
        .create_collection(CreateCollection {
            id: col.clone(),
            is_ref: false,
            permissions: Permissions::empty().to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(matches!(
        res,
        Err(ClientError::Sinkron(
            SinkronError::UnprocessableContent { .. }
        ))
    ));

    // get collection
    let res = client.get_collection(col.clone()).await;
    assert!(matches!(
        res,
        Ok(Collection {
            id,
            colrev: 0,
            is_ref: false,
            ..
        }) if id == col
    ));

    // delete collection
    let res = client.delete_collection(col.clone()).await;
    assert!(res.is_ok());

    // not found
    let res = client.get_collection(col).await;
    assert!(matches!(
        res,
        Err(ClientError::Sinkron(SinkronError::NotFound { .. }))
    ));
}

#[tokio::test]
async fn test_documents() {
    let client = SinkronClient::new(API_URL.to_string(), API_TOKEN.to_string());

    let col = Uuid::new_v4().to_string();

    // create collection
    let res = client
        .create_collection(CreateCollection {
            id: col.clone(),
            is_ref: false,
            permissions: Permissions::empty().to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(res.is_ok());

    let id = Uuid::new_v4();

    // create document
    let res = client
        .create_document(CreateDocument {
            id,
            col: col.clone(),
            content: test_loro_doc(),
            files: Vec::new(),
            permissions: None,
        })
        .await;
    let doc = res.expect("Couldn't create document");
    // TODO match doc

    // create duplicate document
    let res = client
        .create_document(CreateDocument {
            id,
            col: col.clone(),
            content: test_loro_doc(),
            files: Vec::new(),
            permissions: None,
        })
        .await;
    assert!(matches!(
        res,
        Err(ClientError::Sinkron(SinkronError::DuplicateDocumentId))
    ));

    // get document
    let res = client
        .get_document(GetDocument {
            id,
            col: col.clone(),
        })
        .await;
    let doc = res.expect("Couldn't get document");
    // TODO check document

    // not found document
    let res = client
        .get_document(GetDocument {
            id: Uuid::new_v4(),
            col: col.clone(),
        })
        .await;
    assert!(matches!(
        res,
        Err(ClientError::Sinkron(SinkronError::NotFound { .. }))
    ));

    // // col not found
    // const colNotFoundRes = await sinkron.getDocument({ id, col: uuidv4() })
    // assert(!colNotFoundRes.isOk, "col not found")
    // assert.strictEqual(
    // colNotFoundRes.error.code,
    // ErrorCode.NotFound,
    // "col not found"
    // )

    // update document
    let res = client
        .update_document(UpdateDocument {
            id,
            col: col.clone(),
            content_update: Some("TODO".to_string()), // TODO actual update
            files_update: None,
        })
        .await;
    let updated_doc = res.expect("Couldn't update document");
    // TODO check document

    // delete
    let res = client
        .delete_document(DeleteDocument {
            id,
            col: col.clone(),
        })
        .await;
    assert!(res.is_ok());
    // TODO match deleted document
    // let deleted_doc = res.expect("Couldn't delete document");
    // assert!(matches!(
    // deleted_doc,
    // Document {
    // id: an_id,
    // content: None,
    // ..
    // } if id == an_id ));

    // delete already deleted
    let res = client
        .delete_document(DeleteDocument {
            id,
            col: col.clone(),
        })
        .await;
    assert!(matches!(
        res,
        Err(ClientError::Sinkron(
            SinkronError::DocumentAlreadyDeleted { .. }
        ))
    ));

    // update deleted
    let res = client
        .update_document(UpdateDocument {
            id,
            col,
            content_update: Some("TODO".to_string()), // TODO actual update
            files_update: None,
        })
        .await;
    assert!(matches!(
        res,
        Err(ClientError::Sinkron(
            SinkronError::DocumentAlreadyDeleted { .. }
        ))
    ));
}

#[tokio::test]
async fn test_groups() {
    let client = SinkronClient::new(API_URL.to_string(), API_TOKEN.to_string());

    // const col = uuidv4()
    // const permissions = Permissions.any()
    // const createColRes = await sinkron.createCollection({
    // id: col,
    // permissions
    // })
    // assert(createColRes.isOk, "createCollection")

    // const createGroupRes = await sinkron.createGroup("group")
    // assert(createGroupRes.isOk, "createGroup")

    // const addToGroupRes = await sinkron.addUserToGroup({
    // user: "user",
    // group: "group"
    // })
    // assert(addToGroupRes.isOk, "addUserToGroup")

    // const getGroupRes = await sinkron.getGroup("group")
    // assert(getGroupRes.isOk, "getGroup")
    // const group = getGroupRes.value
    // assertIsMatch(group, { id: "group", members: ["user"] })

    // const getUserRes = await sinkron.getUser("user")
    // assert(getUserRes.isOk, "getUser")
    // const user = getUserRes.value
    // assertIsMatch(user, { id: "user", groups: ["group"] })

    // const removeUserRes = await sinkron.removeUserFromGroup({
    // user: "user",
    // group: "group"
    // })
    // assert(removeUserRes.isOk, "removeUserFromGroup")

    // const removeUserFromAllRes = await sinkron.removeUserFromAllGroups(
    // "user"
    // )
    // assert(removeUserFromAllRes.isOk, "removeUserFromAllGroups")

    // const deleteGroupRes = await sinkron.deleteGroup("group")
    // assert(deleteGroupRes.isOk, "deleteGroup")
}
