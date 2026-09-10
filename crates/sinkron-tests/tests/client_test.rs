use uuid::Uuid;

use sinkron_client::{ClientError, SinkronClient};
use sinkron_common::permissions::Permissions;
use sinkron_common::error::SinkronError;
use sinkron_common::types::{
    Collection, CreateCollection, CreateDocument, DeleteDocument, GetDocument,
};

const API_URL: &'static str = "http://localhost:3000";
const API_TOKEN: &'static str = "SINKRON_API_TOKEN";

const INVALID_API_URL: &'static str = "http://invalid_url";
const INVALID_API_TOKEN: &'static str = "INVALID_API_TOKEN";

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
            content: "TODO".to_string(), // TODO
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
            content: "TODO".to_string(), // TODO
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
            col,
        })
        .await;
    assert!(res.is_err());
    // TODO check error => NOT FOUND
    // assert.strictEqual(
    // notFoundRes.error.code,
    // ErrorCode.NotFound,
    // "not found"
    // )

    // // col not found
    // const colNotFoundRes = await sinkron.getDocument({ id, col: uuidv4() })
    // assert(!colNotFoundRes.isOk, "col not found")
    // assert.strictEqual(
    // colNotFoundRes.error.code,
    // ErrorCode.NotFound,
    // "col not found"
    // )

    // // update
    // const version = loroDoc.version()
    // loroDoc.getText("text").insert(5, ", world!")
    // const update = loroDoc.export({ mode: "update", from: version })
    // const updateRes = await sinkron.updateDocument({
    // id,
    // col,
    // data: update
    // })
    // assert(updateRes.isOk, "update")

    // // delete
    // const deleteRes = await sinkron.deleteDocument({ id, col })
    // assert(deleteRes.isOk, "delete")
    // assert.strictEqual(deleteRes.value.data, null, "delete")

    // // already deleted
    // const alreadyDeletedRes = await sinkron.deleteDocument({ id, col })
    // assert(!alreadyDeletedRes.isOk, "already deleted")
    // assert.strictEqual(
    // alreadyDeletedRes.error.code,
    // ErrorCode.UnprocessableContent,
    // "already deleted"
    // )

    // // update deleted
    // const updateDeletedRes = await sinkron.updateDocument({
    // id,
    // col,
    // data: update
    // })
    // assert(!updateDeletedRes.isOk, "update deleted")
    // assert.strictEqual(
    // updateDeletedRes.error.code,
    // ErrorCode.UnprocessableContent,
    // "update deleted"
    // )
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
