use std::sync::Arc;

use axum::Router;
use diesel_migrations::{EmbeddedMigrations, embed_migrations};
use serde::Deserialize;
use sinkron_common::db::{DbConfig, DbConnectionManager};

use crate::api::PhotonApi;
use crate::controllers::PhotonController;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

fn default_host() -> String {
    "0.0.0.0".to_string()
}
fn default_port() -> u32 {
    3000
}

#[derive(Clone, Deserialize)]
pub struct PhotonConfig {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u32,
    pub db: DbConfig,
}

pub struct Photon {
    config: PhotonConfig,
    db: DbConnectionManager,
    controller: Arc<PhotonController>,
    api: PhotonApi,
}

impl Photon {
    pub fn new(config: PhotonConfig) -> Self {
        let db = DbConnectionManager::new(config.db.clone());
        let controller = Arc::new(PhotonController::new(db.clone()));
        let api = PhotonApi::new(controller.clone());

        Self {
            config,
            db,
            controller,
            api,
        }
    }

    pub async fn run(&self) {
        self.db.run_migrations(MIGRATIONS).await.unwrap();

        let router = Router::new().nest("/api", self.api.router());
        let host = format!("{}:{}", self.config.host, self.config.port);
        let listener = tokio::net::TcpListener::bind(host).await.unwrap();
        axum::serve(listener, router).await.unwrap();
    }
}
