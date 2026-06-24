pub mod collections;
pub mod documents;
pub mod files;
pub mod groups;

use crate::actors::sinkron::SinkronHandle;
use crate::db::Db;
use files::S3StorageConfig;

pub struct SinkronControllers {
    pub documents: documents::DocumentsController,
    pub collections: collections::CollectionsController,
    pub groups: groups::GroupsController,
    pub files: files::FilesController,
}

impl SinkronControllers {
    pub fn new(
        db: Db,
        sinkron_actor: SinkronHandle,
        storage_config: S3StorageConfig,
    ) -> Self {
        Self {
            documents: documents::DocumentsController::new(
                sinkron_actor.clone(),
            ),
            collections: collections::CollectionsController::new(
                db.clone(),
                sinkron_actor.clone(),
            ),
            groups: groups::GroupsController::new(db.clone()),
            files: files::FilesController::new(
                db,
                sinkron_actor,
                storage_config,
            ),
        }
    }
}
