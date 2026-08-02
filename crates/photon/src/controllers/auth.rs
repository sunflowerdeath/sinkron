use std::sync::Arc;

use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use rand::{Rng, RngExt};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use sinkron_common::db::DbConnectionManager;

use crate::error::{RequestError, ErrorCode, internal_error};
use crate::models;
use crate::models::{Otp, User};
use crate::schema;
use crate::email::{EmailSender, SendEmailProps};

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

fn validate_email(email: &str) -> bool {
    // TODO
    false
}

pub struct AuthController {
    db: DbConnectionManager,
    email_sender: Arc<dyn EmailSender>,
}

impl AuthController {
    pub fn new(
        db: DbConnectionManager,
        email_sender: Arc<dyn EmailSender>,
    ) -> Self {
        Self { db, email_sender }
    }

    pub async fn issue_otp(&self, email: String) -> Result<Otp, RequestError> {
        let is_valid = validate_email(&email);
        if !is_valid {
            return Err(RequestError {
                code: ErrorCode::InvalidRequest,
                message: "Invalid email".to_string(),
            });
        }

        let mut rng = rand::rng();
        let code = rng.random_range(100000..1000000).to_string();
        let html = "Enter this code on the sign-in page:<br/><b>${code}</b>"
            .to_string();
        // this.lastCode = code
        let text = "Enter this code on the sign-in page:\n${code}".to_string();

        let send_res = self
            .email_sender
            .send(SendEmailProps {
                from: None,
                sender: "Photon".to_string(),
                to: email.clone(),
                subject: "Photon Verification Code".to_string(),
                text,
                html,
            })
            .await;

        if let Err(send_err) = send_res {
            return Err(RequestError {
                code: ErrorCode::InternalServerError,
                message: "Couldn't send email".to_string(),
            });
        }

        let mut conn = self.db.get().await.map_err(internal_error)?;
        let id = Uuid::new_v4();
        let new_otp = models::NewOtp { id, code, email };
        let otp = diesel::insert_into(schema::otps::table)
            .values(&new_otp)
            .returning(models::Otp::as_returning())
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;

        Ok(otp)
    }

    pub async fn verify_otp(&self, props: VerifyOtp) -> Result<AuthResult, ()> {
        return Err(());
    }

    pub async fn get_user_profile(&self, id: Uuid) -> Result<UserProfile, ()> {
        return Err(());
    }
}
