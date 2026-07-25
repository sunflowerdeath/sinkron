use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Request, State},
    middleware,
    response::Response,
    routing::post,
};

use sinkron_common::error::SinkronError;
use sinkron_common::types::{
    AddRemoveUserToGroup, CreateCollection, CreateDocument, DeleteDocument,
    GetDocument, Id, UpdateDocument,
};

use crate::api::helpers::{err_response, get_header_value, json_response};
use crate::config::InternalApiConfig;
use crate::controllers::SinkronControllers;

#[derive(Clone)]
pub struct SinkronApi {
    controller: Arc<SinkronControllers>,
    config: InternalApiConfig,
}

impl SinkronApi {
    pub fn new(
        controller: Arc<SinkronControllers>,
        config: InternalApiConfig,
    ) -> Self {
        println!("TOKEN: {:?}", config.api_token);
        Self { controller, config }
    }

    pub fn router(&self) -> Router {
        Router::new()
            // Documents
            .route("/get_document", post(get_document))
            .route("/create_document", post(create_document))
            .route("/update_document", post(update_document))
            .route("/delete_document", post(delete_document))
            // Collections
            .route("/create_collection", post(create_collection))
            .route("/get_collection", post(get_collection))
            // .route("/delete_collection", post(delete_collection))
            // // Refs
            // .route(
            // "/add_document_to_collection",
            // post(add_document_to_collection),
            // )
            // .route(
            // "/remove_document_from_collection",
            // post(remove_document_from_collection),
            // )
            // Groups & users
            .route("/get_user", post(get_user))
            .route("/get_group", post(get_group))
            .route("/create_group", post(create_group))
            .route("/delete_group", post(delete_group))
            .route("/add_user_to_group", post(add_user_to_group))
            .route("/remove_user_from_group", post(remove_user_from_group))
            .route(
                "/remove_user_from_all_groups",
                post(remove_user_from_all_groups),
            )
            // // Permissions
            // .route(
            // "/update_collection_permissions",
            // post(update_collection_permissions),
            // )
            // .route(
            // "/update_document_permissions",
            // post(update_document_permissions),
            // )
            .layer(middleware::from_fn_with_state(
                self.clone(),
                check_auth_token,
            ))
            .with_state(self.clone())
    }
}

// Auth middleware

async fn check_auth_token(
    State(state): State<SinkronApi>,
    req: Request,
    next: middleware::Next,
) -> Response {
    println!("CHECK AUTH TOKEN");
    let header = get_header_value(&req, "x-sinkron-api-token");
    println!("HEADER: {:?}", header);
    if Some(state.config.api_token) == header {
        next.run(req).await
    } else {
        err_response(SinkronError::auth_failed(
            "Invalid API authorization token",
        ))
    }
}

// Document handlers

async fn get_document(
    State(state): State<SinkronApi>,
    Json(payload): Json<GetDocument>,
) -> Response {
    let res = state.controller.documents.get_document(payload).await;
    json_response(res)
}

async fn create_document(
    State(state): State<SinkronApi>,
    Json(payload): Json<CreateDocument>,
) -> Response {
    let res = state.controller.documents.create_document(payload).await;
    json_response(res)
}

async fn update_document(
    State(state): State<SinkronApi>,
    Json(payload): Json<UpdateDocument>,
) -> Response {
    let res = state.controller.documents.update_document(payload).await;
    json_response(res)
}

async fn delete_document(
    State(state): State<SinkronApi>,
    Json(payload): Json<DeleteDocument>,
) -> Response {
    let res = state.controller.documents.delete_document(payload).await;
    json_response(res)
}

// Collections

async fn create_collection(
    State(state): State<SinkronApi>,
    Json(payload): Json<CreateCollection>,
) -> Response {
    let res = state
        .controller
        .collections
        .create_collection(payload)
        .await;
    json_response(res)
}

async fn get_collection(
    State(state): State<SinkronApi>,
    Json(id): Json<Id>,
) -> Response {
    let res = state.controller.collections.get_collection(id.id).await;
    json_response(res)
}

// Groups handlers

async fn create_group(
    State(sinkron): State<SinkronApi>,
    Json(payload): Json<Id>,
) -> Response {
    let res = sinkron.controller.groups.create_group(payload.id).await;
    json_response(res)
}

async fn get_group(
    State(sinkron): State<SinkronApi>,
    Json(payload): Json<Id>,
) -> Response {
    let res = sinkron.controller.groups.get_group(payload.id).await;
    json_response(res)
}

async fn get_user(
    State(sinkron): State<SinkronApi>,
    Json(payload): Json<Id>,
) -> Response {
    let res = sinkron.controller.groups.get_user(payload.id).await;
    json_response(res)
}

async fn delete_group(
    State(sinkron): State<SinkronApi>,
    Json(payload): Json<Id>,
) -> Response {
    let res = sinkron.controller.groups.delete_group(payload.id).await;
    json_response(res)
}

async fn add_user_to_group(
    State(sinkron): State<SinkronApi>,
    Json(payload): Json<AddRemoveUserToGroup>,
) -> Response {
    let res = sinkron.controller.groups.add_user_to_group(payload).await;
    json_response(res)
}

async fn remove_user_from_group(
    State(sinkron): State<SinkronApi>,
    Json(payload): Json<AddRemoveUserToGroup>,
) -> Response {
    let res = sinkron
        .controller
        .groups
        .remove_user_from_group(payload)
        .await;
    json_response(res)
}

async fn remove_user_from_all_groups(
    State(sinkron): State<SinkronApi>,
    Json(payload): Json<Id>,
) -> Response {
    let res = sinkron
        .controller
        .groups
        .remove_user_from_all_groups(payload.id)
        .await;
    json_response(res)
}

// // Permissions handlers

// async fn update_collection_permissions(
// State(sinkron): State<Sinkron>,
// Json(payload): Json<UpdateCollectionPermissions>,
// ) -> Response {
// let res = sinkron.update_collection_permissions(payload).await;
// sinkron_response(res)
// }

// async fn update_document_permissions(
// State(sinkron): State<Sinkron>,
// Json(payload): Json<UpdateDocumentPermissions>,
// ) -> Response {
// let res = sinkron.update_document_permissions(payload).await;
// sinkron_response(res)
// }
