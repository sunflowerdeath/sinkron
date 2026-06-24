use std::sync::{Arc, OnceLock};

use axum::{
    Router,
    extract::ws::{WebSocket, WebSocketUpgrade},
    extract::{Query, State},
    response::Response,
    routing::{any, get},
};
use log::debug;
use serde::Deserialize;

use crate::actors::sinkron::{
    ConnectMessage, SinkronActorMessage, SinkronHandle,
};
use crate::api::internal_api::SinkronApi;
use crate::api::public_api::SinkronPublicApi;
use crate::config::SinkronConfig;
use crate::controllers::SinkronControllers;
use crate::db::Db;
use crate::error::{SinkronError, internal_error};

#[derive(Clone)]
pub struct Sinkron {
    config: SinkronConfig,
    db: Db,
    actor: SinkronHandle,
    controller: Arc<SinkronControllers>,
    internal_api: SinkronApi,
    public_api: SinkronPublicApi,
}

impl Sinkron {
    pub async fn new(config: SinkronConfig) -> Self {
        let db = Db::new(config.db.clone());

        // Resolve circular dependency between SinkronActor and
        // SinkronController
        let controller_cell = OnceLock::new();
        let actor = SinkronHandle::new(db.clone(), controller_cell.clone());
        let controller = Arc::new(SinkronControllers::new(
            db.clone(),
            actor.clone(),
            config.storage.clone(),
        ));
        controller_cell.set(controller.clone());

        let internal_api =
            SinkronApi::new(config.api_token.clone(), controller.clone());
        let public_api = SinkronPublicApi::new(controller.clone());

        Self {
            db,
            config,
            actor,
            controller,
            internal_api,
            public_api,
        }
    }

    fn app(&self) -> Router {
        let api_router = self.internal_api.router();
        Router::new()
            .route("/", get(root))
            .route("/sync", any(sync_handler))
            .with_state(self.clone())
            .merge(api_router)
    }

    pub async fn run(&self) {
        self.db.run_migrations().await.unwrap();
        let app = self.app();
        let host = format!("{}:{}", self.config.host, self.config.port);
        let listener = tokio::net::TcpListener::bind(host).await.unwrap();
        axum::serve(listener, app).await.unwrap();
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

async fn root() -> &'static str {
    "Sinkron api"
}

#[derive(Deserialize)]
struct SyncQuery {
    token: String,
}

async fn sync_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<SyncQuery>,
    State(sinkron): State<Sinkron>,
) -> Response {
    ws.on_upgrade(async move |ws| sinkron.handle_connect(ws, query).await)
}
