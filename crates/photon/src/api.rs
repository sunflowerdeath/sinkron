use std::sync::Arc;

use uuid::Uuid;
use serde::Deserialize;
use axum::{
    Json, Router,
    extract::{Request, State},
    middleware,
    response::Response,
    routing::{get, post},
};
use sinkron_common::api_helpers::json_response;

use crate::controllers::auth::VerifyOtp;
use crate::controllers::PhotonController;

pub struct PhotonApi {
    controller: Arc<PhotonController>,
}

impl PhotonApi {
    pub fn new(controller: Arc<PhotonController>) -> Self {
        Self { controller }
    }

    pub fn router(&self) -> Router {
        Router::new()
            .route("/", get(root))
            .route("/auth/issue_otp", post(issue_otp))
            .route("/auth/verify_otp", post(verify_otp))
            .route("/profile", get(get_profile))
            // .layer(middleware::from_fn_with_state(
            // self.clone(),
            // check_auth_token,
            // ))
            .with_state(self.controller.clone())
    }
}

#[derive(Deserialize)]
struct IssueOtp {
    email: String,
}

#[derive(Deserialize)]
struct Id {
    id: Uuid,
}

async fn root() -> &'static str {
    "Photon api"
}

async fn issue_otp(
    State(controller): State<Arc<PhotonController>>,
    Json(payload): Json<IssueOtp>,
) -> Response {
    let res = controller.auth.issue_otp(payload.email).await;
    json_response(res)
}

async fn verify_otp(
    State(controller): State<Arc<PhotonController>>,
    Json(payload): Json<VerifyOtp>,
) -> Response {
    let res = controller.auth.verify_otp(payload).await;
    json_response(res)
}

async fn get_profile(
    State(controller): State<Arc<PhotonController>>,
    Json(payload): Json<Id>,
) -> Response {
    let res = controller.auth.get_user_profile(payload.id).await;
    json_response(res)
}
