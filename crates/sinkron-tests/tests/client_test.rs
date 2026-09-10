use base64::prelude::*;
use loro::{ExportMode, LoroDoc};
use uuid::Uuid;

use sinkron_client::{ClientError, SinkronClient};
use sinkron_common::error::SinkronError;
use sinkron_common::permissions::Permissions;
use sinkron_common::types::{
    AddRemoveUserToGroup, Collection, CreateCollection, CreateDocument,
    DeleteDocument, Document, GetDocument, Group, UpdateDocument, User,
};

const API_URL: &'static str = "http://localhost:3000/api";
const API_TOKEN: &'static str = "SINKRON_API_TOKEN";

const INVALID_API_URL: &'static str = "http://invalid_url";
const INVALID_API_TOKEN: &'static str = "INVALID_API_TOKEN";

fn test_loro_doc() -> LoroDoc {
    let doc = LoroDoc::new();
    doc.get_text("text").insert(0, "Hello!").unwrap();
    doc
}

fn serialize_doc(doc: &LoroDoc) -> String {
    let snapshot = doc.export(loro::ExportMode::Snapshot).unwrap();
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

    // TODO not implemented
    // delete collection
    // let res = client.delete_collection(col.clone()).await;
    // assert!(res.is_ok());

    // not found
    let res = client.get_collection("not_found".to_string()).await;
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
    let loro_doc = test_loro_doc();
    let content = serialize_doc(&loro_doc);

    // create document
    let res = client
        .create_document(CreateDocument {
            id,
            col: col.clone(),
            content: content.clone(),
            files: Vec::new(),
            permissions: None,
        })
        .await;
    let doc = res.expect("Couldn't create document");
    assert!(matches!(
        doc,
        Document {
            id: an_id,
            col: a_col,
            ..
        } if id == an_id && col == a_col
    ));

    // create duplicate document
    let res = client
        .create_document(CreateDocument {
            id,
            col: col.clone(),
            content,
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
    assert!(matches!(
        doc,
        Document {
            id: an_id,
            col: a_col,
            ..
        } if id == an_id && col == a_col
    ));

    // not found document id
    let res = client
        .get_document(GetDocument {
            id: Uuid::new_v4(), // <- not found id
            col: col.clone(),
        })
        .await;
    assert!(matches!(
        res,
        Err(ClientError::Sinkron(SinkronError::NotFound { .. }))
    ));

    // not found col
    let res = client
        .get_document(GetDocument {
            id,
            col: Uuid::new_v4().to_string(), // <- not found col
        })
        .await;
    assert!(matches!(
        res,
        Err(ClientError::Sinkron(SinkronError::NotFound { .. }))
    ));

    // update document

    let vv = loro_doc.oplog_vv();
    loro_doc.get_text("update").insert(0, "Update!").unwrap();
    let update = loro_doc.export(ExportMode::updates(&vv)).unwrap();
    let serialized_update = BASE64_STANDARD.encode(update);

    let res = client
        .update_document(UpdateDocument {
            id,
            col: col.clone(),
            content_update: Some(serialized_update),
            files_update: None,
        })
        .await;
    let updated_doc = res.expect("Couldn't update document");
    // TODO check document is updated?
    assert!(matches!(
        updated_doc,
        Document {
            id: an_id,
            col: a_col,
            ..
        } if id == an_id && col == a_col
    ));

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

    // create group
    let res = client.create_group("group".to_string()).await;
    assert!(res.is_ok());

    // add user to group
    let res = client
        .add_user_to_group(AddRemoveUserToGroup {
            user: "user".to_string(),
            group: "group".to_string(),
        })
        .await;
    assert!(res.is_ok());

    // get group
    let res = client.get_group("group".to_string()).await;
    assert!(matches!(
        res,
        Ok(Group {
            id: an_id,
            members
        }) if an_id == "group" && members == ["user".to_string()]
    ));

    // get user
    let res = client.get_user("user".to_string()).await;
    assert!(matches!(
        res,
        Ok(User {
            id: an_id,
            groups
        }) if an_id == "user" && groups == ["group".to_string()]
    ));

    // remove user from group
    let res = client
        .remove_user_from_group(AddRemoveUserToGroup {
            user: "user".to_string(),
            group: "group".to_string(),
        })
        .await;
    assert!(res.is_ok());

    // remove user from all groups
    let res = client.remove_user_from_all_groups("user".to_string()).await;
    assert!(res.is_ok());

    // delete group
    let res = client.delete_group("group".to_string()).await;
    assert!(res.is_ok());
}
