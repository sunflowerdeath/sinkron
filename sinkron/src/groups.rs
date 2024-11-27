use std::num::NonZeroUsize;

use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use lru::LruCache;
use serde::Deserialize;
use tokio::sync::Mutex;

use crate::db;
use crate::error::{internal_error, SinkronError};
use crate::models;
use crate::schema;
use crate::types::{Group, User};

#[derive(Deserialize)]
pub struct AddRemoveUserToGroup {
    pub user: String,
    pub group: String,
}

pub struct GroupsApi {
    pool: db::DbConnectionPool,
    cache: Mutex<LruCache<String, User>>,
}

impl GroupsApi {
    pub fn new(pool: db::DbConnectionPool) -> Self {
        Self {
            pool,
            cache: Mutex::new(LruCache::new(NonZeroUsize::new(5000).unwrap())),
        }
    }

    async fn connect(&self) -> Result<db::DbConnection, SinkronError> {
        self.pool.get().await.map_err(internal_error)
    }

    async fn group_exists(
        &self,
        conn: &mut db::DbConnection,
        id: &str,
    ) -> Result<bool, SinkronError> {
        let cnt: i64 = schema::groups::table
            .filter(schema::groups::id.eq(&id))
            .count()
            .get_result(conn)
            .await
            .map_err(internal_error)?;
        Ok(cnt != 0)
    }

    async fn get_user_from_cache(&self, id: &str) -> Option<User> {
        let mut cache = self.cache.lock().await;
        cache.get(id).cloned()
    }

    async fn put_user_to_cache(&self, id: String, user: User) {
        let mut cache = self.cache.lock().await;
        cache.put(id, user);
    }

    async fn remove_user_from_cache(&self, id: &str) {
        let mut cache = self.cache.lock().await;
        cache.pop(id);
    }

    pub async fn get_user(&self, id: String) -> Result<User, SinkronError> {
        if let Some(user) = self.get_user_from_cache(&id).await {
            return Ok(user);
        }
        let mut conn = self.connect().await?;
        let groups: Vec<String> = schema::members::table
            .filter(schema::members::user.eq(&id))
            .select(schema::members::group)
            .get_results(&mut conn)
            .await
            .map_err(internal_error)?;
        let user = User {
            id: id.clone(),
            groups,
        };
        self.put_user_to_cache(id, user.clone()).await;
        Ok(user)
    }

    pub async fn get_group(&self, id: String) -> Result<Group, SinkronError> {
        let mut conn = self.connect().await?;
        let exists = self.group_exists(&mut conn, &id).await?;
        if !exists {
            return Err(SinkronError::not_found("Group not found"));
        }
        let members: Vec<String> = schema::members::table
            .filter(schema::members::group.eq(&id))
            .select(schema::members::user)
            .get_results(&mut conn)
            .await
            .map_err(internal_error)?;
        Ok(Group { id, members })
    }

    pub async fn create_group(&self, id: String) -> Result<(), SinkronError> {
        let mut conn = self.connect().await?;
        let new_group = models::Group { id };
        let _ = diesel::insert_into(schema::groups::table)
            .values(&new_group)
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        Ok(())
    }

    pub async fn delete_group(&self, id: String) -> Result<(), SinkronError> {
        let mut conn = self.connect().await?;
        let _ = diesel::delete(schema::members::table)
            .filter(schema::members::group.eq(&id))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        // TODO invalidate users that were members of the group
        let num = diesel::delete(schema::groups::table)
            .filter(schema::groups::id.eq(&id))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        if num == 0 {
            Err(SinkronError::not_found("Group not found"))
        } else {
            Ok(())
        }
    }

    pub async fn add_user_to_group(
        &self,
        props: AddRemoveUserToGroup,
    ) -> Result<(), SinkronError> {
        let AddRemoveUserToGroup { user, group } = props;
        let mut conn = self.connect().await?;
        let exists = self.group_exists(&mut conn, &group).await?;
        if !exists {
            return Err(SinkronError::not_found("Group not found"));
        }
        let new_member = models::Member {
            user: user.clone(),
            group,
        };
        let _ = diesel::insert_into(schema::members::table)
            .values(&new_member)
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        self.remove_user_from_cache(&user).await;
        Ok(())
    }

    pub async fn remove_user_from_group(
        &self,
        props: AddRemoveUserToGroup,
    ) -> Result<(), SinkronError> {
        let AddRemoveUserToGroup { user, group } = props;
        let mut conn = self.connect().await?;
        let num = diesel::delete(schema::members::table)
            .filter(schema::members::user.eq(&user))
            .filter(schema::members::group.eq(&group))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        if num == 0 {
            Err(SinkronError::not_found("Group member not found"))
        } else {
            self.remove_user_from_cache(&user).await;
            Ok(())
        }
    }

    pub async fn remove_user_from_all_groups(
        &self,
        id: String,
    ) -> Result<(), SinkronError> {
        let mut conn = self.connect().await?;
        let _ = diesel::delete(schema::members::table)
            .filter(schema::members::user.eq(&id))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;
        self.remove_user_from_cache(&id).await;
        Ok(())
    }
}
