use uuid::Uuid;

use sinkron_client::SinkronClient;
use sinkron_common::error::SinkronError;
use sinkron_common::types::{
    CreateCollection, CreateDocument, DeleteDocument, GetDocument,
};

const API_URL: &'static str = "http://localhost:3000";
const API_TOKEN: &'static str = "SINKRON_API_TOKEN";

const INVALID_API_URL: &'static str = "http://INVALID";
const INVALID_API_TOKEN: &'static str = "INVALID_API_TOKEN";

#[tokio::test]
async fn test_auth() {
    // const permissions = Permissions.any()

    let client =
        SinkronClient::new(INVALID_API_URL.to_string(), API_TOKEN.to_string());
    // const invalidUrlClient = new SinkronClient({
    // url: "INVALID",
    // token: "INVALID"
    // })
    // const invalidUrlRes = await invalidUrlClient.createCollection({
    // id: uuidv4(),
    // permissions
    // })
    // assert(!invalidUrlRes.isOk, "fetch error")
    // assert.strictEqual(invalidUrlRes.error.code, ErrorCode.FetchError)

    let client =
        SinkronClient::new(API_URL.to_string(), INVALID_API_TOKEN.to_string());
    // const invalidTokenClient = new SinkronClient({ url, token: "INVALID" })
    // const invalidTokenRes = await invalidTokenClient.createCollection({
    // id: uuidv4(),
    // permissions
    // })
    // assert(!invalidTokenRes.isOk, "auth failed")
    // assert.strictEqual(invalidTokenRes.error.code, ErrorCode.AuthFailed)
}

#[tokio::test]
async fn test_collections() {
    let client = SinkronClient::new(API_URL.to_string(), API_TOKEN.to_string());

    // const col = uuidv4()
    // const permissions = Permissions.any()
    // const createRes = await sinkron.createCollection({
    // id: col,
    // permissions
    // })
    // assertIsMatch(createRes, {
    // isOk: true,
    // value: { id: col, colrev: 0 }
    // })

    // const duplicateRes = await sinkron.createCollection({
    // id: col,
    // permissions
    // })
    // assert(!duplicateRes.isOk, "duplicate")
    // assertIsMatch(duplicateRes, {
    // isOk: false,
    // error: { code: ErrorCode.UnprocessableContent }
    // })

    // const getRes = await sinkron.getCollection(col)
    // assertIsMatch(getRes, {
    // isOk: true,
    // value: { id: col, colrev: 0 }
    // })

    // const notFoundRes = await sinkron.getCollection("not_found")
    // assertIsMatch(notFoundRes, {
    // isOk: false,
    // error: { code: ErrorCode.NotFound }
    // })

    // // const deleteRes = await sinkron.deleteCollection("test")
    // // assert(deleteRes.isOk, "delete")
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
            permissions: "TODO".to_string(),
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
    let err = res.unwrap_err();
    assert_eq!(
        err,
        ClientError::Response(SinkronError::DuplicateDocumentId)
    );

    // get document
    let res = client.get_document(GetDocument { id, col }).await;
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
