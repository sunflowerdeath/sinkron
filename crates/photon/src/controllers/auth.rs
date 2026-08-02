use serde::{Deserialize, Serialize};
use uuid::Uuid;

use sinkron_common::db::DbConnectionManager;

use crate::models::{Otp, User};

#[derive(Deserialize)]
pub struct VerifyOtp {
    id: Uuid,
    password: String,
}

#[derive(Serialize)]
pub struct AuthResult {
    auth_token: String,
}

#[derive(Serialize)]
pub struct UserProfile {
    id: String,
}

pub struct AuthController {
    db: DbConnectionManager,
}

impl AuthController {
    pub fn new(db: DbConnectionManager) -> Self {
        Self { db }
    }

    pub async fn issue_otp(&self, email: String) -> Result<Otp, ()> {
        // TODO
        return Err(());
    }

    pub async fn verify_otp(&self, props: VerifyOtp) -> Result<AuthResult, ()> {
        return Err(());
    }

    pub async fn get_user_profile(&self, id: Uuid) -> Result<UserProfile, ()> {
        return Err(());
    }
}
