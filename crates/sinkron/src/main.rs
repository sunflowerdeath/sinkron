mod actors;
mod api;
mod config;
mod controllers;
mod db;
mod error;
mod models;
mod permissions;
mod protocol;
mod schema;
mod sinkron;
mod types;

use crate::config::SinkronConfig;
use crate::sinkron::Sinkron;

#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
pub async fn main() {
    env_logger::init();

    let config = match SinkronConfig::from_env_var("SINKRON_CONFIG") {
        Ok(config) => config,
        Err(err) => {
            log::error!("{}", err);
            return;
        }
    };

    let sinkron = Sinkron::new(config).await;
    sinkron.run().await;
}
