mod actors;
mod api_types;
mod db;
mod error;
mod models;
mod permissions;
mod protocol;
mod schema;
mod sinkron;

use std::env;

#[tokio::main]
async fn main() {
    env_logger::init();
    let config = serde_json::from_str::<sinkron::SinkronConfig>(
        &env::var("SINKRON_CONFIG").unwrap(),
    )
    .unwrap();
    let sinkron = sinkron::Sinkron::new(config).await;
    sinkron.run().await;
}
