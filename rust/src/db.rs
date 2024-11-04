use diesel_async::pooled_connection::deadpool::Pool;
use diesel_async::{
    pooled_connection::AsyncDieselConnectionManager, AsyncPgConnection,
};

use diesel_async::async_connection_wrapper::AsyncConnectionWrapper;
use diesel_migrations::{
    embed_migrations, EmbeddedMigrations, MigrationHarness,
};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

pub async fn run_migrations(
    async_conn: AsyncPgConnection,
) -> Result<(), String> {
    let mut async_wrapper: AsyncConnectionWrapper<AsyncPgConnection> =
        AsyncConnectionWrapper::from(async_conn);
    tokio::task::spawn_blocking(move || {
        let res = async_wrapper.run_pending_migrations(MIGRATIONS);
        match res {
            Ok(_) => Ok(()),
            Err(err) => {
                Err(format!("Couldn't run migrations: {}", err.to_string()))
            }
        }
    }).await.unwrap()
}

pub type DbConnection =
    deadpool::managed::Object<AsyncDieselConnectionManager<AsyncPgConnection>>;

pub type DbConnectionPool = deadpool::managed::Pool<
    AsyncDieselConnectionManager<diesel_async::AsyncPgConnection>,
>;

#[derive(serde::Deserialize)]
pub struct DbConfig {
    pub host: String,
    pub port: i32,
    pub user: String,
    pub password: String,
    pub database: String,
}

pub async fn create_pool(config: DbConfig) -> DbConnectionPool {
    let config_string = format!(
        "host={} port={} user={} password={} dbname={}",
        config.host, config.port, config.user, config.password, config.database,
    );
    let manager =
        AsyncDieselConnectionManager::<diesel_async::AsyncPgConnection>::new(
            config_string,
        );
    let pool = Pool::builder(manager).max_size(4).build().unwrap();
    pool
}
