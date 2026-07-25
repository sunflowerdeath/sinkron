use uuid::Uuid;

use sinkron_client::{ClientError, SinkronClient};
use sinkron_common::error::SinkronError;
use sinkron_common::permissions::Permissions;
use sinkron_common::types::{Collection, CreateCollection};

const URL: &str = "http://localhost:3000/api";
const TOKEN: &str = "SINKRON_API_TOKEN";

#[tokio::test]
async fn test_auth() {
    let invalid_url_client = SinkronClient::new(
        "INVALID_URL".to_string(),
        "INVALID_TOKEN".to_string(),
    );
    let res = invalid_url_client
        .create_collection(CreateCollection {
            id: "col".to_string(),
            is_ref: false,
            permissions: Permissions::empty().to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(matches!(res, Err(ClientError::Request(_))));

    let invalid_token_client =
        SinkronClient::new(URL.to_string(), "INVALID_TOKEN".to_string());
    let res = invalid_token_client
        .create_collection(CreateCollection {
            id: "col".to_string(),
            is_ref: false,
            permissions: Permissions::empty().to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(matches!(
        res,
        Err(ClientError::Response(SinkronError::AuthFailed { .. }))
    ));
}

#[tokio::test]
async fn test_collections() {
    let client = SinkronClient::new(URL.to_string(), TOKEN.to_string());

    let col = Uuid::new_v4().to_string();
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
        Ok(Collection{ id, colrev: 0, .. }) if id == col
    ));

    let duplicate_res = client
        .create_collection(CreateCollection {
            id: col.clone(),
            is_ref: false,
            permissions: Permissions::empty().to_string(),
            storage_limit: 0,
        })
        .await;
    assert!(matches!(
        duplicate_res,
        Err(ClientError::Response(
            SinkronError::UnprocessableContent { .. }
        ))
    ));

    let get_res = client.get_collection(col.clone()).await;
    assert!(
        matches!(get_res, Ok(Collection { id, colrev: 0, .. }) if id == col )
    );

    let not_found_res = client.get_collection("not_found".to_string()).await;
    assert!(matches!(
        not_found_res,
        Err(ClientError::Response(SinkronError::NotFound { .. }))
    ));

    // // const deleteRes = await sinkron.deleteCollection("test")
    // // assert(deleteRes.isOk, "delete")
}
