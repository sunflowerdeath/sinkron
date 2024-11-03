mod db;
mod models;
mod protocol;
mod schema;
mod sinkron;

use std::env;

#[tokio::main]
async fn main() {
    env_logger::init();

    /*
    let db = db::DbConfig {
        host: "localhost".to_string(),
        port: 5432,
        database: "sinkron_rs".to_string(),
        user: "postgres".to_string(),
        password: "password".to_string(),
    };
    let config = sinkron::SinkronConfig {
        host: env::var("SINKRON_HOST").unwrap(),
        port: env::var("SINKRON_PORT").unwrap(),
        api_token: env::var("SINKRON_API_TOKEN").unwrap(),
        db
    };
    */
    let config = serde_json::from_str::<sinkron::SinkronConfig>(
        &env::var("SINKRON_CONFIG").unwrap(),
    ).unwrap();
    let sinkron = sinkron::Sinkron::new(config).await;
    sinkron.listen().await;
}
