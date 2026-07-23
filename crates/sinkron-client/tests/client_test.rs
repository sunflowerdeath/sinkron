use sinkron_client::{ClientError, SinkronClient};
use sinkron_common::error::SinkronError;
use sinkron_common::permissions::Permissions;
use sinkron_common::types::CreateCollection;

const URL: &str = "https://localhost:3000";

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
