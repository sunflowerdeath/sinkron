use diesel_async::pooled_connection::deadpool::Pool;
use diesel_async::{
    pooled_connection::AsyncDieselConnectionManager, AsyncPgConnection,
};

pub type DbConnection =
    deadpool::managed::Object<AsyncDieselConnectionManager<AsyncPgConnection>>;

pub type DbConnectionPool = deadpool::managed::Pool<
    AsyncDieselConnectionManager<diesel_async::AsyncPgConnection>,
>;

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
    let pool = Pool::builder(manager).build().unwrap();
    pool
}
