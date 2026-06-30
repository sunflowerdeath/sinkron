use std::sync::Arc;

use axum::{
    Json, Router,
    body::Bytes,
    extract::ws::{WebSocket, WebSocketUpgrade},
    extract::{Query, Request, State},
    middleware,
    response::Response,
    routing::{any, get, post},
};
use log::debug;
use serde::Deserialize;
use uuid::Uuid;

use crate::actors::sinkron::{
    ConnectMessage, SinkronActorMessage, SinkronHandle,
};
use crate::api::helpers::{
    bin_response, err_response, get_header_value, json_response,
};
use crate::config::PublicApiConfig;
use crate::controllers::SinkronControllers;
use crate::controllers::files::{InitFileUpload, UploadFileChunk};
use crate::error::{SinkronError, internal_error};

#[derive(Clone)]
pub struct SinkronPublicApi {
    config: PublicApiConfig,
    controller: Arc<SinkronControllers>,
    actor: SinkronHandle,
}

impl SinkronPublicApi {
    pub fn new(
        config: PublicApiConfig,
        controller: Arc<SinkronControllers>,
        actor: SinkronHandle,
    ) -> Self {
        Self {
            config,
            controller,
            actor,
        }
    }

    pub fn router(&self) -> Router {
        Router::new()
            // Websocket
            .route("/sync", any(sync_handler))
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
        match &self.config.auth_url {
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

    async fn handle_connect(&self, websocket: WebSocket, query: SyncQuery) {
        let user_id = match self.auth(&query.token).await {
            Ok(user) => {
                debug!("sinkron: authorized client as {}", user);
                user
            }
            Err(err) => {
                debug!("sinkron: client authorization failed {:?}", err);
                // TODO send something?
                // let msg = ServerMessage::SyncError(SyncErrorMessage {
                // code: err.code,
                // });
                // let Ok(str_msg) = serde_json::to_string(&msg) else {
                // return;
                // };
                // _ = websocket.send(Message::Text(str_msg.into())).await;
                return;
            }
        };
        self.actor
            .send(SinkronActorMessage::Connect(ConnectMessage {
                websocket,
                user_id,
            }))
            .expect("SinkronActor shoudn't exit");
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
        Ok(user_id) => {
            // TODO req.extensions_mut().insert(user);
            next.run(req).await
        },
        Err(error) => err_response(error),
    }
}

#[derive(Deserialize)]
struct SyncQuery {
    token: String,
}

async fn sync_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<SyncQuery>,
    State(sinkron): State<SinkronPublicApi>,
) -> Response {
    ws.on_upgrade(async move |ws| sinkron.handle_connect(ws, query).await)
}

async fn init_file_upload(
    State(state): State<SinkronPublicApi>,
    Json(payload): Json<InitFileUpload>,
) -> Response {
    // TODO check user permissions in collection
    let res = state.controller.files.init_file_upload(payload).await;
    json_response(res)
}

async fn upload_file_chunk(
    State(state): State<SinkronPublicApi>,
    Query(query): Query<UploadFileChunk>,
    body: Bytes,
) -> Response {
    // TODO check user permissions in collection
    let res = state.controller.files.upload_file_chunk(query, body).await;
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
