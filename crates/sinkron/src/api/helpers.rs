use axum::{
    Json,
    extract::Request,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use bytes::Bytes;
use serde::Serialize;

use sinkron_common::error::SinkronErrorResponseBody;

pub fn get_header_value(req: &Request, header: &str) -> Option<String> {
    let header_value = req.headers().get(header)?;
    if let Ok(str) = header_value.to_str() {
        Some(str.to_string())
    } else {
        None
    }
}

pub fn err_response<E: Serialize>(error: E) -> Response {
    let body = Json(SinkronErrorResponseBody { error });
    (StatusCode::INTERNAL_SERVER_ERROR, body).into_response()
}

pub fn json_response<T, E>(result: Result<T, E>) -> Response
where
    E: Serialize,
    T: Serialize,
{
    match result {
        Ok(res) => Json(res).into_response(),
        Err(err) => err_response(err),
    }
}

pub fn bin_response<E>(result: Result<Bytes, E>) -> Response
where
    E: Serialize,
{
    match result {
        Ok(res) => res.into_response(),
        Err(err) => err_response(err),
    }
}
