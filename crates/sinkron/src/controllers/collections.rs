use diesel::prelude::*;
use diesel_async::RunQueryDsl;

use crate::actors::sinkron::SinkronHandle;
use crate::db::Db;
use crate::error::{SinkronError, internal_error};
use crate::models;
use crate::schema;
use crate::types::Collection;

pub type CreateCollection = models::NewCollection;

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
        let col = diesel::insert_into(schema::collections::table)
            .values(&props)
            .returning(models::Collection::as_returning())
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;
        Ok(col)
    }

    pub async fn get_collection(
        &self,
        id: String,
    ) -> Result<models::Collection, SinkronError> {
        let mut conn = self.db.get().await.map_err(internal_error)?;
        schema::collections::table
            .find(id)
            .first(&mut conn)
            .await
            .map_err(|err| match err {
                diesel::NotFound => {
                    SinkronError::not_found("Collection not found")
                }
                err => SinkronError::internal(&err.to_string()),
            })
    }

    // TODO delete_collection
}
