use reqwest::header::{HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

use sinkron_common::api_types::{
    CreateCollection, CreateDocument, DeleteDocument, GetDocument, Id,
    UpdateDocument,
};
use sinkron_common::error::SinkronError;
use sinkron_common::types::{Collection, Document};

#[derive(Deserialize)]
struct SinkronErrorResponse {
    error: SinkronError,
}

pub struct SinkronClient {
    url: String,
    token: String,
}

impl SinkronClient {
    pub fn new(url: String, token: String) -> Self {
        Self { url, token }
    }

    async fn send_request<T: Serialize, U: DeserializeOwned>(
        self,
        url: &str,
        payload: T,
    ) -> Result<U, SinkronError> {
        let Ok(body) = serde_json::to_string(&payload) else {
            return Err(SinkronError::internal("Couldn't serialize json"));
        };

        let mut headers = HeaderMap::new();
        headers.insert(
            "content-type",
            HeaderValue::from_static("application/json"),
        );
        headers.insert("accept", HeaderValue::from_static("application/json"));
        headers.insert(
            "x-sinkron-api-token",
            HeaderValue::from_str(&self.token).unwrap(),
        );

        // TODO reuse client and headers
        let client = reqwest::Client::new();

        let url = format!("{}/{}", &self.url, url);
        let Ok(res) = client.post(url).headers(headers).body(body).send().await
        else {
            return Err(SinkronError::internal("Couldn't send request"));
        };

        if res.status().is_success() {
            // TODO how to handle empty response ?
            let parsed = res.json::<U>().await;
            match parsed {
                Ok(res) => Ok(res),
                Err(_) => {
                    Err(SinkronError::internal("Couldn't parse response json"))
                }
            }
        } else {
            let err = res.json::<SinkronErrorResponse>().await;
            match err {
                Ok(err) => Err(err.error),
                Err(_) => {
                    Err(SinkronError::internal("Couldn't parse response json"))
                }
            }
        }
    }

    pub async fn create_collection(
        self,
        props: CreateCollection,
    ) -> Result<Collection, SinkronError> {
        // TODO parse permissions ?
        self.send_request("create_collection", props).await
    }

    pub async fn get_collection(
        self,
        id: String,
    ) -> Result<Collection, SinkronError> {
        let props = Id { id };
        self.send_request("get_collection", props).await
    }

    pub async fn delete_collection(
        self,
        id: String,
    ) -> Result<(), SinkronError> {
        let props = Id { id };
        self.send_request("delete_collection", props).await
    }

    pub async fn create_document(
        self,
        props: CreateDocument,
    ) -> Result<Document, SinkronError> {
        self.send_request("create_document", props).await
    }

    pub async fn get_document(
        self,
        props: GetDocument,
    ) -> Result<Document, SinkronError> {
        self.send_request("get_document", props).await
    }

    pub async fn update_document(
        self,
        props: UpdateDocument,
    ) -> Result<Document, SinkronError> {
        self.send_request("update_document", props).await
    }

    pub async fn delete_document(
        self,
        props: DeleteDocument,
    ) -> Result<(), SinkronError> {
        self.send_request("delete_document", props).await
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
