use std::fmt;

use diesel_async::{
    AsyncPgConnection,
    async_connection_wrapper::AsyncConnectionWrapper,
    pooled_connection::{AsyncDieselConnectionManager, deadpool::Pool},
};
use diesel_migrations::{
    EmbeddedMigrations, MigrationHarness, embed_migrations,
};
use tokio::time::Duration;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!();

pub type DbConnection =
    deadpool::managed::Object<AsyncDieselConnectionManager<AsyncPgConnection>>;

pub type DbConnectionPool = deadpool::managed::Pool<
    AsyncDieselConnectionManager<AsyncPgConnection>,
>;

#[derive(Clone, serde::Deserialize)]
pub struct DbConfig {
    pub host: String,
    pub port: i32,
    pub user: String,
    pub password: String,
    pub database: String,
}

#[derive(Clone)]
pub struct Db {
    pool: DbConnectionPool,
}

#[derive(std::fmt::Debug)]
pub enum DbErrorKind {
    ConnectError,
    MigrateError,
}

#[derive(std::fmt::Debug)]
pub struct DbError {
    pub kind: DbErrorKind,
    pub message: String,
}

impl fmt::Display for DbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let kind_str = match self.kind {
            DbErrorKind::ConnectError => "Couldn't connect to database",
            DbErrorKind::MigrateError => "Couldn't run migrations",
        };
        write!(f, "{}: {}", kind_str, self.message)
    }
}

impl std::error::Error for DbError {}

impl Db {
    pub fn new(config: DbConfig) -> Self {
        let config_string = format!(
            "host={} port={} user={} password={} dbname={}",
            config.host,
            config.port,
            config.user,
            config.password,
            config.database,
        );
        let manager = AsyncDieselConnectionManager::<
            diesel_async::AsyncPgConnection,
        >::new(config_string);
        let pool = Pool::builder(manager)
            .max_size(50)
            .runtime(deadpool::Runtime::Tokio1)
            .wait_timeout(Some(Duration::from_millis(1000)))
            .build()
            .unwrap();
        Self { pool }
    }

    pub async fn get(&self) -> Result<DbConnection, DbError> {
        self.pool.get().await.map_err(|e| DbError {
            kind: DbErrorKind::ConnectError,
            message: format!("{:?}", e),
        })
    }

    pub async fn run_migrations(&self) -> Result<(), DbError> {
        let conn = self.get().await?;
        let conn = deadpool::managed::Object::take(conn);
        let mut async_wrapper: AsyncConnectionWrapper<AsyncPgConnection> =
            AsyncConnectionWrapper::from(conn);
        tokio::task::spawn_blocking(move || {
            let res = async_wrapper.run_pending_migrations(MIGRATIONS);
            match res {
                Ok(_) => Ok(()),
                Err(e) => Err(DbError {
                    kind: DbErrorKind::MigrateError,
                    message: format!("{:?}", e),
                }),
            }
        })
        .await
        .unwrap()
    }
}
