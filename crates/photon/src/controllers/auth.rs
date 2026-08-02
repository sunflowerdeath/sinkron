use std::sync::Arc;

use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use rand::{Rng, RngExt};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use sinkron_common::db::DbConnectionManager;

use crate::email::{EmailSender, SendEmailProps};
use crate::error::{RequestError, internal_error};
use crate::models;
use crate::models::{Otp, User};
use crate::schema;

const MAX_OTP_ATTEMPTS: i16 = 3;

#[derive(Deserialize)]
pub struct VerifyOtp {
    id: Uuid,
    password: String,
    client: String,
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
        if !validate_email(&email) {
            return Err(RequestError::bad_request("Invalid email address"));
        }

        let mut rng = rand::rng();
        let code = rng.random_range(100000..1000000).to_string();
        let html = "Enter this code on the sign-in page:<br/><b>${code}</b>"
            .to_string();
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
            return Err(RequestError::internal("Couldn't send email"));
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

    pub async fn verify_otp(
        &self,
        props: VerifyOtp,
    ) -> Result<models::AuthToken, RequestError> {
        let VerifyOtp {
            id,
            password,
            client,
        } = props;

        let mut conn = self.db.get().await.map_err(internal_error)?;
        let otp = schema::otps::table
            .find(id)
            .first::<models::Otp>(&mut conn)
            .await
            .map_err(|err| match err {
                diesel::NotFound => RequestError::not_found(
                    "Code not found. Generate new code.",
                ),
                err => RequestError::internal(&err.to_string()),
            })?;

        // TODO
        // const expiresAt = addSeconds(otp.createdAt, otpLifeSpan)
        // if (isAfter(new Date(), expiresAt)) {
        // await models.otps.delete({ id })
        // return Result.err({
        // code: ErrorCode.InvalidRequest,
        // message: "Code is expired. Generate new code.",
        // details: { error: "is_expired" }
        // })
        // }

        if otp.code != password {
            if otp.attempts + 1 >= MAX_OTP_ATTEMPTS {
                let _ = diesel::delete(schema::otps::table)
                    .filter(schema::otps::id.eq(&id))
                    .execute(&mut conn)
                    .await
                    .map_err(internal_error)?;
                return Err(RequestError::unprocessable(
                    "Too many incorrect attempts. Generate new code.",
                ));
            } else {
                diesel::update(schema::otps::table)
                    .filter(schema::otps::id.eq(&id))
                    .set(schema::otps::attempts.eq(otp.attempts + 1))
                    .execute(&mut conn)
                    .await
                    .map_err(internal_error)?;
            }
            return Err(RequestError::unprocessable("Incorrect code."));
        }

        let _ = diesel::delete(schema::otps::table)
            .filter(schema::otps::id.eq(&id))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;

        let user = schema::users::table
            .filter(schema::users::email.eq(otp.email.clone()))
            .first::<models::User>(&mut conn)
            .await
            .optional()
            .map_err(internal_error)?;

        let user_id = match user {
            Some(user) => user.id,
            None => self.create_user(otp.email).await?.id,
        };

        self.issue_auth_token(user_id, client).await
    }

    async fn create_user(&self, email: String) -> Result<User, RequestError> {
        if !validate_email(&email) {
            return Err(RequestError::bad_request("Invalid email address"));
        }

        let mut conn = self.db.get().await.map_err(internal_error)?;
        let count: i64 = schema::users::table
            .filter(schema::users::email.eq(&email))
            .count()
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;
        if count > 0 {
            return Err(RequestError::unprocessable(
                "User with this email already exists.",
            ));
        }

        let new_user = models::NewUser { email };
        let user = diesel::insert_into(schema::users::table)
            .values(&new_user)
            .returning(models::User::as_returning())
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;

        Ok(user)
    }

    async fn issue_auth_token(
        &self,
        user_id: Uuid,
        client_string: String,
    ) -> Result<models::AuthToken, RequestError> {
        let mut conn = self.db.get().await.map_err(internal_error)?;
        let count: i64 = schema::users::table
            .filter(schema::users::id.eq(&user_id))
            .count()
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;
        if count == 0 {
            return Err(RequestError::unprocessable("User not found."));
        }

        let new_token = models::NewAuthToken { user_id, client_string };
        let token = diesel::insert_into(schema::auth_tokens::table)
            .values(&new_token)
            .returning(models::AuthToken::as_returning())
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;

        // TODO
        // this.#deleteExpiredTokens(models, userId)
        // this.#deleteTokensOverLimit(models, userId)

        Ok(token)
    }

    pub async fn get_user_profile(
        &self,
        id: Uuid,
    ) -> Result<UserProfile, RequestError> {
        // TODO
        Err(RequestError::internal("Not implemented"))
    }
}
