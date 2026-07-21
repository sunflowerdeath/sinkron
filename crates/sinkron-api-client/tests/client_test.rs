use sinkron_client::SinkronClient;
use sinkron_common::permissions::Permissions;
use sinkron_common::types::CreateCollection;

const URL: &str = "https://localhost:123";

#[tokio::test]
async fn test_auth() {
    // const permissions = Permissions.any()

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
    assert!(res.is_err());
    // assert.strictEqual(invalidUrlRes.error.code, ErrorCode.FetchError)

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
    assert!(res.is_err());
    // assert(!invalidTokenRes.isOk, "auth failed")
    // assert.strictEqual(invalidTokenRes.error.code, ErrorCode.AuthFailed)
}
