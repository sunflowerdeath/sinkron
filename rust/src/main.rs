mod models;
mod protocol;
mod schema;
// mod sinkron;
mod db;
mod sinkron2;

#[tokio::main]
async fn main() {
    env_logger::init();

    let config = db::DbConfig {
        host: "localhost".to_string(),
        port: 5432,
        database: "sinkron_rs".to_string(),
        user: "postgres".to_string(),
        password: "password".to_string(),
    };
    /*
    let config = {
        port: 80,
        host: "localhost",
        api_token: env.SINKRON_API_TOKEN,
        sync_auth_url: env.SINKRON_AUTH_URL
    };
    */
    // let sinkron = sinkron::Sinkron::new(config).await;
    // sinkron.listen().await;
    let sinkron2 = sinkron2::Sinkron::new(config).await;
    sinkron2.listen().await;
}
