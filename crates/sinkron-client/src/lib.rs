use reqwest::Response;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

use sinkron_common::error::SinkronError;
use sinkron_common::types::{
    AddRemoveUserToGroup, Collection, CreateCollection, CreateDocument,
    DeleteDocument, Document, GetDocument, Group, Id, UpdateDocument, User,
};

pub enum ClientError {
    Request(String),
    Response(SinkronError),
}

#[derive(Deserialize)]
struct SinkronErrorResponse {
    error: SinkronError,
}

pub struct SinkronClient {
    url: String,
    token: String,
    client: reqwest::Client,
}

impl SinkronClient {
    pub fn new(url: String, token: String) -> Self {
        let client = reqwest::Client::new();
        Self { url, token, client }
    }

    async fn send_request<T: Serialize>(
        self,
        url: &str,
        payload: T,
    ) -> Result<Response, ClientError> {
        let Ok(body) = serde_json::to_string(&payload) else {
            return Err(ClientError::Request(
                "Couldn't serialize json".to_string(),
            ));
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

        let url = format!("{}/{}", &self.url, url);
        let Ok(res) = self
            .client
            .post(url)
            .headers(headers)
            .body(body)
            .send()
            .await
        else {
            return Err(ClientError::Request(
                "Couldn't perform request".to_string(),
            ));
        };

        if res.status().is_success() {
            Ok(res)
        } else {
            let err = res.json::<SinkronErrorResponse>().await;
            match err {
                Ok(err) => Err(ClientError::Response(err.error)),
                Err(_) => Err(ClientError::Request(
                    "Couldn't parse response json".to_string(),
                )),
            }
        }
    }

    async fn send_json_request<T: Serialize, U: DeserializeOwned>(
        self,
        url: &str,
        payload: T,
    ) -> Result<U, ClientError> {
        let res = self.send_request(url, payload).await?;
        res.json::<U>().await.map_err(|_| {
            ClientError::Request("Couldn't parse response json".to_string())
        })
    }

    async fn send_empty_request<T: Serialize>(
        self,
        url: &str,
        payload: T,
    ) -> Result<(), ClientError> {
        let _ = self.send_request(url, payload).await?;
        Ok(())
    }

    pub async fn create_collection(
        self,
        props: CreateCollection,
    ) -> Result<Collection, ClientError> {
        // TODO parse permissions ?
        self.send_json_request("create_collection", props).await
    }

    pub async fn get_collection(
        self,
        id: String,
    ) -> Result<Collection, ClientError> {
        let props = Id { id };
        self.send_json_request("get_collection", props).await
    }

    pub async fn delete_collection(
        self,
        id: String,
    ) -> Result<(), ClientError> {
        let props = Id { id };
        self.send_empty_request("delete_collection", props).await
    }

    pub async fn create_document(
        self,
        props: CreateDocument,
    ) -> Result<Document, ClientError> {
        self.send_json_request("create_document", props).await
    }

    pub async fn get_document(
        self,
        props: GetDocument,
    ) -> Result<Document, ClientError> {
        self.send_json_request("get_document", props).await
    }

    pub async fn update_document(
        self,
        props: UpdateDocument,
    ) -> Result<Document, ClientError> {
        self.send_json_request("update_document", props).await
    }

    pub async fn delete_document(
        self,
        props: DeleteDocument,
    ) -> Result<(), ClientError> {
        self.send_empty_request("delete_document", props).await
    }

    pub async fn create_group(self, id: String) -> Result<(), ClientError> {
        self.send_empty_request("create_group", Id { id }).await
    }

    pub async fn get_group(self, id: String) -> Result<Group, ClientError> {
        self.send_json_request("get_group", Id { id }).await
    }

    pub async fn delete_group(self, id: String) -> Result<(), ClientError> {
        self.send_empty_request("delete_group", Id { id }).await
    }

    pub async fn get_user(self, id: String) -> Result<User, ClientError> {
        self.send_json_request("get_user", Id { id }).await
    }

    pub async fn add_user_to_group(
        self,
        props: AddRemoveUserToGroup,
    ) -> Result<(), ClientError> {
        self.send_empty_request("add_user_to_group", props).await
    }

    pub async fn remove_user_from_group(
        self,
        props: AddRemoveUserToGroup,
    ) -> Result<(), ClientError> {
        self.send_empty_request("remove_user_from_group", props)
            .await
    }

    pub async fn remove_user_from_all_groups(
        self,
        id: String,
    ) -> Result<(), ClientError> {
        self.send_empty_request("remove_user_from_all_groups", Id { id })
            .await
    }

    // update_collection_permissions
    //
    // update_document_permissions
}
