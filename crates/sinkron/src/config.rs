use std::env;

use crate::controllers::files::S3StorageConfig;
use crate::db;

fn default_host() -> String {
    "0.0.0.0".to_string()
}
fn default_port() -> u32 {
    3000
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SinkronConfig {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u32,
    // TODO internal_api_auth_token
    pub api_token: String,
    // TODO public_api_auth_url
    pub sync_auth_url: Option<String>,
    pub db: db::DbConfig,
    pub storage: S3StorageConfig,
}

impl SinkronConfig {
    pub fn from_env_var(var: &str) -> Result<Self, String> {
        let Ok(config_str) = &env::var(var) else {
            return Err(format!(
                "Config not found! Set env variable \"{}\"",
                var
            ));
        };

        serde_json::from_str::<SinkronConfig>(config_str).map_err(|err| {
            format!("Error parsing config:\n{}\n\n{}", err, config_str)
        })
    }
}
