use std::sync::Arc;

use chrono::{Duration, Utc};
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use rand::RngExt;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use sinkron_common::db::{DbConnection, DbConnectionManager};

use crate::email::{EmailSender, SendEmailProps};
use crate::error::{RequestError, internal_error};
use crate::models;
use crate::models::{Otp, User};
use crate::schema;

const OTP_MAX_ATTEMPTS: i16 = 3;
const OTP_EXPIRATION_DURATION: Duration = Duration::minutes(30);

#[derive(Deserialize)]
pub struct AuthWithOtp {
    id: Uuid,
    password: String,
    client_string: String,
}

#[derive(Serialize)]
pub struct UserProfile {
    id: String,
}

#[derive(Serialize)]
pub struct Session {
    is_current: bool,
    last_active: chrono::DateTime<chrono::Utc>,
    from: Option<String>,
    client_string: String,
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

    pub async fn send_otp(&self, email: String) -> Result<Otp, RequestError> {
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
            // TODO log send err
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

    pub async fn auth_with_otp(
        &self,
        props: AuthWithOtp,
    ) -> Result<models::AuthToken, RequestError> {
        let AuthWithOtp {
            id,
            password,
            client_string,
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

        // check if otp is expired
        let now = Utc::now();
        let expires_at = otp.created_at + OTP_EXPIRATION_DURATION;
        if expires_at < now {
            self.delete_otp(&mut conn, &id).await?;
            return Err(RequestError::unprocessable(
                "Code is expired. Generate new code.",
            ));
        }

        // check code
        if otp.code != password {
            if otp.attempts + 1 >= OTP_MAX_ATTEMPTS {
                self.delete_otp(&mut conn, &id).await?;
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

        self.delete_otp(&mut conn, &id).await?;
        let user = self.get_or_create_user(&mut conn, otp.email).await?;
        self.create_auth_token(user.id, client_string).await
    }

    pub async fn get_user_profile(
        &self,
        id: Uuid,
    ) -> Result<UserProfile, RequestError> {
        // TODO
        Err(RequestError::internal("Not implemented"))
    }

    pub async fn delete_other_auth_tokens(
        &self,
        user_id: Uuid,
        token: &str,
    ) -> Result<(), RequestError> {
        let mut conn = self.db.get().await.map_err(internal_error)?;
        let _ = diesel::delete(schema::auth_tokens::table)
            .filter(schema::auth_tokens::user_id.eq(user_id))
            .filter(schema::auth_tokens::token.ne(token))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        Ok(())
    }

    pub async fn get_active_sessions(
        &self,
        user_id: Uuid,
        token: &str,
    ) -> Result<Vec<Session>, RequestError> {
        let mut conn = self.db.get().await.map_err(internal_error)?;

        // await this.#deleteExpiredTokens(models, userId)

        let tokens = schema::auth_tokens::table
            .filter(schema::auth_tokens::user_id.eq(user_id))
            .order_by(schema::auth_tokens::last_access.desc())
            .load::<models::AuthToken>(&mut conn)
            .await
            .map_err(internal_error)?;

        let sessions = tokens
            .into_iter()
            .map(|t| Session {
                last_active: t.last_access,
                from: None,
                client_string: t.client_string,
                is_current: t.token == token,
            })
            .collect();

        Ok(sessions)
    }

    // Helpers

    async fn delete_otp(
        &self,
        conn: &mut DbConnection,
        id: &Uuid,
    ) -> Result<(), RequestError> {
        let _ = diesel::delete(schema::otps::table)
            .filter(schema::otps::id.eq(id))
            .execute(conn)
            .await
            .map_err(internal_error)?;
        Ok(())
    }

    async fn get_or_create_user(
        &self,
        conn: &mut DbConnection,
        email: String,
    ) -> Result<User, RequestError> {
        let res = schema::users::table
            .filter(schema::users::email.eq(email.clone()))
            .first::<models::User>(conn)
            .await
            .optional()
            .map_err(internal_error)?;
        match res {
            Some(user) => Ok(user),
            None => self.create_user(conn, email).await,
        }
    }

    async fn create_user(
        &self,
        conn: &mut DbConnection,
        email: String,
    ) -> Result<User, RequestError> {
        if !validate_email(&email) {
            return Err(RequestError::bad_request("Invalid email address"));
        }

        let count: i64 = schema::users::table
            .filter(schema::users::email.eq(&email))
            .count()
            .get_result(conn)
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
            .get_result(conn)
            .await
            .map_err(internal_error)?;

        Ok(user)
    }

    async fn create_auth_token(
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

        let new_token = models::NewAuthToken {
            user_id,
            client_string,
        };
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
}
