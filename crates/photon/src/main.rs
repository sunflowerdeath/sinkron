pub mod models;
pub mod schema;

use std::env;

use diesel_migrations::{EmbeddedMigrations, embed_migrations};
use sinkron_common::db::{DbConfig, DbConnectionManager};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

struct PhotonController {
    auth: AuthController,
}

impl PhotonController {
    fn new() -> Self {
        Self {
            auth: AuthController::new(),
        }
    }
}

struct AuthController {}

impl AuthController {
    fn new() -> Self {
        Self {}
    }

    async fn send_code(&self, email: String) {}

    async fn auth_with_code(&self, id: String, code: String) {}

    async fn issue_auth_token(&self) {}

    async fn check_auth_token(&self) {}
}

#[derive(Clone, serde::Deserialize)]
struct PhotonConfig {
    db: DbConfig,
}

struct Photon {
    controller: PhotonController,
    db: DbConnectionManager,
}

impl Photon {
    fn new(config: PhotonConfig) -> Self {
        Self {
            controller: PhotonController::new(),
            db: DbConnectionManager::new(config.db),
        }
    }

    async fn run(&self) {
        self.db.run_migrations(MIGRATIONS).await.unwrap();
    }

    pub fn router(&self) -> Router {
        Router::new()
            .route("/login", post(login))
            .route("/code", post(code))
            .route("/profile", get(profile))
            .layer(middleware::from_fn_with_state(
                self.clone(),
                check_auth_token,
            ))
            .with_state(self.clone())
    }
}

const PHOTON_CONFIG_ENV_VAR: &str = "PHOTON_CONFIG";

#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
pub async fn main() {
    env_logger::init();

    let Ok(config_str) = &env::var(PHOTON_CONFIG_ENV_VAR) else {
        log::error!(
            "Config not found! Set env variable \"{}\"",
            PHOTON_CONFIG_ENV_VAR
        );
        return;
    };

    let config = match serde_json::from_str::<PhotonConfig>(config_str) {
        Ok(config) => config,
        Err(err) => {
            log::error!("Error parsing config:\n{}\n\n{}", err, config_str);
            return;
        }
    };

    let photon = Photon::new(config);
    photon.run().await;
}
