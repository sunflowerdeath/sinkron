pub mod api;
pub mod controllers;
pub mod email;
pub mod error;
pub mod models;
pub mod photon;
pub mod schema;

use std::env;

use crate::photon::{Photon, PhotonConfig};

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
