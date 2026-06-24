// @generated automatically by Diesel CLI.

diesel::table! {
    collections (id) {
        id -> Text,
        is_ref -> Bool,
        colrev -> Int8,
        permissions -> Text,
        storage_limit -> Int8,
        used_storage -> Int8,
    }
}

diesel::table! {
    documents (id) {
        id -> Uuid,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
        col_id -> Text,
        colrev -> Int8,
        content -> Nullable<Bytea>,
        files -> Array<Nullable<Uuid>>,
        is_deleted -> Bool,
        permissions -> Text,
    }
}

diesel::table! {
    file_uploads (id) {
        id -> Uuid,
        file_id -> Uuid,
        created_at -> Timestamptz,
        col_id -> Text,
        size -> Int8,
        checksum -> Text,
    }
}

diesel::table! {
    files (id) {
        id -> Uuid,
        col_id -> Text,
        doc_id -> Uuid,
        size -> Int8,
        checksum -> Text,
    }
}

diesel::table! {
    groups (id) {
        id -> Text,
    }
}

diesel::table! {
    members (id) {
        id -> Uuid,
        group -> Text,
        user -> Text,
    }
}

diesel::table! {
    refs (id) {
        id -> Uuid,
        is_deleted -> Bool,
        colrev -> Int8,
        col_id -> Text,
        doc_id -> Uuid,
    }
}

diesel::joinable!(documents -> collections (col_id));
diesel::joinable!(file_uploads -> collections (col_id));
diesel::joinable!(files -> collections (col_id));
diesel::joinable!(files -> documents (doc_id));
diesel::joinable!(members -> groups (group));
diesel::joinable!(refs -> collections (col_id));
diesel::joinable!(refs -> documents (doc_id));

diesel::allow_tables_to_appear_in_same_query!(
    collections,
    documents,
    file_uploads,
    files,
    groups,
    members,
    refs,
);
