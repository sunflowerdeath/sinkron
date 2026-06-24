use std::sync::Arc;

use uuid::Uuid;
use axum::{
    Json, Router,
    extract::{Query, Request, State},
    middleware,
    response::Response,
    routing::{get, post},
};
use serde::Deserialize;

use crate::api::helpers::{
    bin_response, err_response, get_header_value, json_response,
};
use crate::controllers::SinkronControllers;
use crate::controllers::files::{InitFileUpload, UploadFileChunk};
use crate::error::{SinkronError, internal_error};

#[derive(Clone)]
pub struct SinkronPublicApi {
    controller: Arc<SinkronControllers>,
}

impl SinkronPublicApi {
    pub fn new(controller: Arc<SinkronControllers>) -> Self {
        Self { controller }
    }

    pub fn router(&self) -> Router {
        Router::new()
            // Files
            .route("/init_file_upload", post(init_file_upload))
            .route("/upload_file_chunk", post(upload_file_chunk))
            .route("/get_file_chunk", get(get_file_chunk))
            .layer(middleware::from_fn_with_state(
                self.clone(),
                auth_middleware,
            ))
            .with_state(self.clone())
    }

    async fn auth(&self, token: &str) -> Result<String, SinkronError> {
        match &self.config.sync_auth_url {
            Some(auth_url) => {
                let url = "".to_string() + auth_url + token;
                let req = reqwest::Client::new()
                    .post(url)
                    .send()
                    .await
                    .map_err(internal_error)?;
                if req.status() != reqwest::StatusCode::OK {
                    return Err(SinkronError::auth_failed(
                        "Authentication failed",
                    ));
                }
                let Ok(user) = req.text().await else {
                    return Err(SinkronError::auth_failed(
                        "Authentication failed",
                    ));
                };
                Ok(user)
            }
            None => Ok("anonymous".to_string()),
        }
    }
}

async fn auth_middleware(
    State(state): State<SinkronPublicApi>,
    req: Request,
    next: middleware::Next,
) -> Response {
    let Some(header) = get_header_value(&req, "x-sinkron-auth-token") else {
        return err_response(SinkronError::auth_failed(
            "Invalid authorization token",
        ));
    };
    match state.auth(&header).await {
        Ok(user_id) => next.run(req).await,
        Err(error) => err_response(error),
    }
}

async fn init_file_upload(
    State(state): State<SinkronPublicApi>,
    Json(payload): Json<InitFileUpload>,
) -> Response {
    // TODO check user permissions in collection
    let res = state.controller.files.init_file_upload(payload).await;
    json_response(res)
}

#[derive(Deserialize)]
struct UploadFileChunkQuery {
    file_id: Uuid,
    col_id: String,
    chunk_number: u32,
}

async fn upload_file_chunk(
    State(state): State<SinkronPublicApi>,
    Query(query): Query<UploadFileChunkQuery>,
) -> Response {
    // TODO check user permissions in collection
    let res = state.controller.files.upload_file_chunk(query).await;
    json_response(res)
}

#[derive(Deserialize)]
struct GetFileChunkQuery {
    file_id: Uuid,
    chunk_number: u32,
}

async fn get_file_chunk(
    State(state): State<SinkronPublicApi>,
    Query(query): Query<GetFileChunkQuery>,
) -> Response {
    // TODO check user permissions in collection
    let GetFileChunkQuery {
        file_id,
        chunk_number,
    } = query;
    let res = state
        .controller
        .files
        .get_file_chunk("col".to_string(), file_id, chunk_number)
        .await;
    bin_response(res)
}
