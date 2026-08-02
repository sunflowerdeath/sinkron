pub mod auth;

use sinkron_common::db::DbConnectionManager;

use auth::AuthController;

pub struct PhotonController {
    pub auth: AuthController,
}

impl PhotonController {
    pub fn new(db: DbConnectionManager) -> Self {
        Self {
            auth: AuthController::new(db),
        }
    }
}
