use std::sync::{Arc, OnceLock};

use axum::{Router, routing::get};

use crate::actors::sinkron::SinkronHandle;
use crate::api::internal_api::SinkronApi;
use crate::api::public_api::SinkronPublicApi;
use crate::config::SinkronConfig;
use crate::controllers::SinkronControllers;
use crate::db::Db;

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
        let controller_cell = Arc::new(OnceLock::new());
        let actor = SinkronHandle::new(db.clone(), controller_cell.clone());
        let controller = Arc::new(SinkronControllers::new(
            db.clone(),
            actor.clone(),
            config.storage.clone(),
        ));
        let _ = controller_cell.set(controller.clone());

        let internal_api =
            SinkronApi::new(controller.clone(), config.internal_api.clone());
        let public_api = SinkronPublicApi::new(
            config.public_api.clone(),
            controller.clone(),
            actor.clone(),
        );

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
        Router::new()
            .route("/", get(root))
            .merge(self.public_api.router())
            .nest("/api", self.internal_api.router())
    }

    pub async fn run(&self) {
        self.db.run_migrations().await.unwrap();
        let app = self.app();
        let host = format!("{}:{}", self.config.host, self.config.port);
        let listener = tokio::net::TcpListener::bind(host).await.unwrap();
        axum::serve(listener, app).await.unwrap();
    }
}

async fn root() -> &'static str {
    "Sinkron"
}
