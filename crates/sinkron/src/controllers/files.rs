use async_trait::async_trait;
use bytes::Bytes;
use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use s3;
use serde::Deserialize;
use uuid::Uuid;

use sinkron_common::error::{SinkronError, internal_error};

use crate::actors::sinkron::SinkronHandle;
use crate::db::{Db, DbConnection};
use crate::models;
use crate::schema;

const CHUNK_SIZE: u64 = 2 * 1024 * 1024; // 2 Mb

/*
To upload a file client first initiates upload using `init_file_upload` method.
Then client uploads file chunks one by one using the `upload_file_chunk` method.
Uploaded chunks are placed in the temporary storage, which periodically deletes
old entries.

After all chunks have been uploaded, client can create file by attaching it to
a document.

If all chunks are located successfully, they are combined into a single file,
which is then stored in the persistent storage.

If some chunks are not found while creating a file, client should retry the
uploading process from the beginning. There can only be one upload process
per file. Calling `init_file_upload` again for the same file ID replaces
the existing upload process.
*/

#[derive(Deserialize)]
pub struct InitFileUpload {
    file_id: Uuid,
    col_id: String,
    size: i64,
    checksum: String,
}

#[derive(Deserialize)]
pub struct UploadFileChunk {
    file_id: Uuid,
    col_id: String,
    chunk_number: u32, // starts from 1
}

pub struct FilesController {
    db: Db,
    sinkron_actor: SinkronHandle,
    storage_adapter: Box<dyn StorageAdapter + Send + Sync>,
}

impl FilesController {
    pub fn new(
        db: Db,
        sinkron_actor: SinkronHandle,
        s3_config: S3StorageConfig,
    ) -> Self {
        let storage_adapter = Box::new(
            S3StorageAdapter::new(s3_config)
                .expect("Failed to initialize S3StorageAdapter"),
        );
        FilesController {
            db,
            sinkron_actor,
            storage_adapter,
        }
    }

    async fn connect(&self) -> Result<DbConnection, SinkronError> {
        self.db.get().await.map_err(internal_error)
    }

    // TODO call from collecition api
    async fn get_collection(
        &self,
        id: &str,
    ) -> Result<models::Collection, SinkronError> {
        let mut conn = self.connect().await?;
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

    pub async fn init_file_upload(
        &self,
        props: InitFileUpload,
    ) -> Result<(), SinkronError> {
        let InitFileUpload {
            file_id,
            col_id,
            size,
            checksum,
        } = props;

        let mut conn = self.connect().await?;

        let count: i64 = schema::files::table
            .find(&file_id)
            .count()
            .get_result(&mut conn)
            .await
            .map_err(internal_error)?;
        if count > 0 {
            return Err(SinkronError::unprocessable(
                "File with such id already exists",
            ));
        }

        // TODO check max file size / collection file size limit

        let col = self.get_collection(&col_id).await?;
        let remaining_storage = col.storage_limit - col.used_storage;
        if remaining_storage < size {
            return Err(SinkronError::InsufficientStorage);
        }

        // delete previous uploads with same file_id
        diesel::delete(schema::file_uploads::table)
            .filter(schema::file_uploads::file_id.eq(&file_id))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;

        // create new file upload
        let id = Uuid::new_v4();
        let new_file_upload = models::NewFileUpload {
            id,
            file_id,
            col_id,
            size,
            checksum,
        };
        diesel::insert_into(schema::file_uploads::table)
            .values(&new_file_upload)
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;

        Ok(())
    }

    pub async fn upload_file_chunk(
        &self,
        props: UploadFileChunk,
        data: bytes::Bytes,
    ) -> Result<(), SinkronError> {
        let UploadFileChunk {
            file_id,
            col_id,
            chunk_number,
        } = props;
        // check that file upload exists
        let mut conn = self.connect().await?;
        let file_upload: models::FileUpload = schema::file_uploads::table
            .filter(schema::file_uploads::file_id.eq(&file_id))
            .filter(schema::file_uploads::col_id.eq(&col_id))
            .first(&mut conn)
            .await
            .map_err(|err| match err {
                diesel::NotFound => SinkronError::FileNotFound { file_id },
                err => SinkronError::internal(&err.to_string()),
            })?;

        // check chunk number
        let chunks_count = (file_upload.size as u64 / CHUNK_SIZE) as u32;
        if chunk_number == 0 || chunk_number > chunks_count {
            return Err(SinkronError::unprocessable("Invalid chunk number"));
        }

        // store chunk via storage provider
        self.storage_adapter
            .upload_file_chunk(file_id, chunk_number, &data)
            .await
            .map_err(internal_error)?;

        Ok(())
    }

    pub async fn create_files(
        &self,
        col_id: String,
        doc_id: Uuid,
        files: Vec<Uuid>,
    ) -> Result<(), SinkronError> {
        // check that col exists and get remaining storage
        let col = self.get_collection(&col_id).await?;
        let remaining_storage = col.storage_limit - col.used_storage;

        let mut conn = self.connect().await?;
        // check that file uploads exist and col has enough storage space
        let file_uploads = schema::file_uploads::table
            .filter(schema::file_uploads::file_id.eq_any(&files))
            .filter(schema::file_uploads::col_id.eq(&col_id))
            .load::<models::FileUpload>(&mut conn)
            .await
            .map_err(|err| match err {
                err => SinkronError::internal(&err.to_string()),
            })?;

        let mut total_file_size = 0;
        for file_id in files {
            let Some(file_upload) =
                file_uploads.iter().find(|f| f.file_id == file_id)
            else {
                return Err(SinkronError::FileNotFound { file_id });
            };
            total_file_size += file_upload.size;
            if total_file_size > remaining_storage {
                return Err(SinkronError::InsufficientStorage);
            }
        }

        // create files from uploaded chunks
        for file_upload in file_uploads {
            let models::FileUpload {
                file_id,
                size,
                checksum,
                ..
            } = file_upload;

            // create file from uploaded chunks via storage adapter
            self.storage_adapter
                .create_file_from_chunks(file_id, size as u64, checksum.clone())
                .await?;

            // TODO verify file size and checksum

            // delete file upload
            let _ = diesel::delete(schema::file_uploads::table)
                .filter(schema::file_uploads::id.eq(&file_upload.id))
                .execute(&mut conn)
                .await
                .map_err(internal_error)?;

            // create permanent file
            let new_file = models::NewFile {
                id: file_id,
                col_id: col_id.clone(),
                doc_id,
                size,
                checksum: checksum,
            };
            diesel::insert_into(schema::files::table)
                .values(&new_file)
                .execute(&mut conn)
                .await
                .map_err(internal_error)?;
        }

        // update col used storage
        let new_used_storage = col.used_storage + total_file_size;
        diesel::update(schema::collections::table)
            .filter(schema::collections::id.eq(col_id))
            .set(schema::collections::used_storage.eq(new_used_storage))
            .execute(&mut conn)
            .await
            .map_err(internal_error)?;

        Ok(())
    }

    pub async fn delete_files(
        col: String,
        files: Vec<Uuid>,
    ) -> Result<(), SinkronError> {
        // TODO
        // check files exist
        // delete files from storage
        // delete files rows
        // update col used_storage
        Err(SinkronError::internal("Not implemented"))
    }

    pub async fn get_file_chunk(
        &self,
        col: String,
        file_id: Uuid,
        chunk_number: u32,
    ) -> Result<Bytes, SinkronError> {
        Err(SinkronError::internal("Not implemented"))
    }
}

#[async_trait]
trait StorageAdapter {
    async fn upload_file_chunk(
        &self,
        file_id: Uuid,
        chunk_number: u32,
        content: &[u8],
    ) -> Result<(), SinkronError>;

    async fn create_file_from_chunks(
        &self,
        file_id: Uuid,
        file_size: u64,
        checksum: String,
    ) -> Result<(), SinkronError>;

    async fn get_file_chunk(
        &self,
        file_id: Uuid,
        chunk_number: u32,
    ) -> Result<Bytes, SinkronError>;

    async fn delete_file(&self, file_id: Uuid) -> Result<(), SinkronError>;
}

#[derive(Clone, serde::Deserialize)]
pub struct S3BucketConfig {
    pub region: String,
    pub endpoint: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub bucket_name: String,
}

#[derive(Clone, serde::Deserialize)]
pub struct S3StorageConfig {
    pub temp_bucket: S3BucketConfig,
    pub permanent_bucket: S3BucketConfig,
}

struct S3StorageAdapter {
    temp_bucket: Box<s3::Bucket>,
    permanent_bucket: Box<s3::Bucket>,
}

impl S3StorageAdapter {
    pub fn new(config: S3StorageConfig) -> Result<Self, s3::error::S3Error> {
        let temp_bucket = Self::bucket(config.temp_bucket)?;
        let permanent_bucket = Self::bucket(config.permanent_bucket)?;
        Ok(Self {
            temp_bucket,
            permanent_bucket,
        })
    }

    fn bucket(
        config: S3BucketConfig,
    ) -> Result<Box<s3::Bucket>, s3::error::S3Error> {
        let region = s3::Region::Custom {
            region: config.region,
            endpoint: config.endpoint,
        };
        let credentials = s3::creds::Credentials::new(
            Some(&config.access_key_id),
            Some(&config.secret_access_key),
            None,
            None,
            None,
        )
        .unwrap();
        s3::bucket::Bucket::new(
            &config.bucket_name,
            region,
            credentials.clone(),
        )
    }
}

#[async_trait]
impl StorageAdapter for S3StorageAdapter {
    async fn upload_file_chunk(
        &self,
        file_id: Uuid,
        chunk_number: u32,
        content: &[u8],
    ) -> Result<(), SinkronError> {
        let path = file_id.to_string() + "_" + &chunk_number.to_string();
        let _ = self
            .temp_bucket
            .put_object(path, content)
            .await
            .map_err(internal_error)?;

        Ok(())
    }

    async fn create_file_from_chunks(
        &self,
        file_id: Uuid,
        file_size: u64,
        checksum: String,
    ) -> Result<(), SinkronError> {
        let chunks_prefix = file_id.to_string() + "_";
        let list_result = self
            .temp_bucket
            .list(chunks_prefix, None)
            .await
            .map_err(internal_error)?;
        let mut chunk_keys = Vec::new();
        for result in list_result {
            for object in result.contents {
                chunk_keys.push(object.key);
            }
        }
        chunk_keys.sort();

        let chunks_count = file_size / CHUNK_SIZE;
        if chunk_keys.len() as u64 != chunks_count {
            return Err(SinkronError::FileMissingChunks { file_id });
        }

        let file_upload_path = file_id.to_string();
        let s3::serde_types::InitiateMultipartUploadResponse {
            upload_id, ..
        } = self
            .permanent_bucket
            .initiate_multipart_upload(
                &file_upload_path,
                "application/octet-stream", // TODO content type ?
            )
            .await
            .map_err(internal_error)?;

        let mut uploaded_parts = Vec::new();
        for key in chunk_keys {
            let chunk_data = self
                .temp_bucket
                .get_object(key)
                .await
                .map_err(internal_error)?;
            let part_number = uploaded_parts.len() as u32 + 1;
            let part = self
                .permanent_bucket
                .put_multipart_chunk(
                    chunk_data.bytes().to_vec(),
                    &file_upload_path,
                    part_number,
                    &upload_id,
                    "application/octet-stream", // TODO content_type
                )
                .await
                .map_err(internal_error)?;
            uploaded_parts.push(part);
        }

        let _ = self
            .permanent_bucket
            .complete_multipart_upload(
                &file_upload_path,
                &upload_id,
                uploaded_parts,
            )
            .await
            .map_err(internal_error)?;

        Ok(())
    }

    async fn get_file_chunk(
        &self,
        file_id: Uuid,
        chunk_number: u32,
    ) -> Result<Bytes, SinkronError> {
        let start = (chunk_number as u64 - 1) * CHUNK_SIZE;
        let end = start + CHUNK_SIZE; // TODO none if last chunk ?
        let data = self
            .permanent_bucket
            .get_object_range(file_id.to_string(), start, Some(end))
            .await
            .map_err(internal_error)?;
        Ok(data.into_bytes())
    }

    async fn delete_file(&self, file_id: Uuid) -> Result<(), SinkronError> {
        let _ = self
            .permanent_bucket
            .delete_object(file_id.to_string())
            .await
            .map_err(internal_error)?;
        Ok(())
    }
}

struct FsStorageAdapter {}
