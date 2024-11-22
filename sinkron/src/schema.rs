// @generated automatically by Diesel CLI.

diesel::table! {
    collections (id) {
        id -> Text,
        is_ref -> Bool,
        colrev -> Int8,
        permissions -> Text,
    }
}

diesel::table! {
    documents (id) {
        id -> Uuid,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
        col_id -> Text,
        colrev -> Int8,
        data -> Nullable<Bytea>,
        is_deleted -> Bool,
        permissions -> Text,
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
        is_removed -> Bool,
        colrev -> Int8,
        col_id -> Text,
        doc_id -> Uuid,
    }
}

diesel::joinable!(documents -> collections (col_id));
diesel::joinable!(members -> groups (group));
diesel::joinable!(refs -> collections (col_id));
diesel::joinable!(refs -> documents (doc_id));

diesel::allow_tables_to_appear_in_same_query!(
    collections,
    documents,
    groups,
    members,
    refs,
);
