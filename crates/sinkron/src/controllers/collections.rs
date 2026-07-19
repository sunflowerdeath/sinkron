use diesel::prelude::*;
use diesel_async::RunQueryDsl;

use sinkron_common::api_types::CreateCollection;
use sinkron_common::error::{SinkronError, internal_error};
use sinkron_common::types::Collection;

use crate::actors::sinkron::SinkronHandle;
use crate::db::Db;
use crate::models;
use crate::schema;

pub struct CollectionsController {
    db: Db,
    sinkron_actor: SinkronHandle,
}

impl CollectionsController {
    pub fn new(db: Db, sinkron_actor: SinkronHandle) -> Self {
        CollectionsController { db, sinkron_actor }
    }

    pub async fn create_collection(
        &self,
        props: CreateCollection,
    ) -> Result<Collection, SinkronError> {
        let mut conn = self.db.get().await.map_err(internal_error)?;
        let cnt: i64 = schema::collections::table
            .filter(schema::collections::id.eq(&props.id))
            .count()
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;
        if cnt != 0 {
            return Err(SinkronError::unprocessable("Duplicate collection id"));
        }
        let new_col = models::NewCollection {
            id: props.id,
            is_ref: props.is_ref,
            permissions: props.permissions,
            storage_limit: props.storage_limit,
        };
        let col = diesel::insert_into(schema::collections::table)
            .values(&new_col)
            .returning(models::Collection::as_returning())
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;
        Ok(col.into())
    }

    pub async fn get_collection(
        &self,
        id: String,
    ) -> Result<Collection, SinkronError> {
        let mut conn = self.db.get().await.map_err(internal_error)?;
        let res = schema::collections::table
            .find(id)
            .first::<models::Collection>(&mut conn)
            .await;
        match res {
            Ok(col) => Ok(col.into()),
            Err(err) => Err(match err {
                diesel::NotFound => {
                    SinkronError::not_found("Collection not found")
                }
                err => SinkronError::internal(&err.to_string()),
            }),
        }
    }

    // TODO delete_collection
}
