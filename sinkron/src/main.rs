mod actors;
mod db;
mod error;
mod groups;
mod models;
mod permissions;
mod protocol;
mod schema;
mod sinkron;
mod types;

use std::env;

#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() {
    env_logger::init();

    let Ok(config_str) = &env::var("SINKRON_CONFIG") else {
        log::error!("Config not found! Set env variable \"SINKRON_CONFIG\"");
        return;
    };

    let config =
        match serde_json::from_str::<sinkron::SinkronConfig>(config_str) {
            Ok(config) => config,
            Err(err) => {
                log::error!("Error parsing config:\n{}\n\n{}", err, config_str);
                return;
            }
        };

    let sinkron = sinkron::Sinkron::new(config).await;
    sinkron.run().await;
}
