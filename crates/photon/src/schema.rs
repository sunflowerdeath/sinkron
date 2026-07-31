// @generated automatically by Diesel CLI.

diesel::table! {
    auth_tokens (token) {
        token -> Text,
        created_at -> Timestamptz,
        expires_at -> Nullable<Timestamptz>,
        last_access -> Timestamptz,
        client_string -> Text,
        user_id -> Uuid,
    }
}

diesel::table! {
    otps (id) {
        id -> Uuid,
        created_at -> Timestamptz,
        email -> Text,
        code -> Text,
        attempts -> Int2,
    }
}

diesel::table! {
    users (id) {
        id -> Uuid,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
        email -> Text,
        is_disabled -> Bool,
        picture -> Text,
    }
}

diesel::joinable!(auth_tokens -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(auth_tokens, otps, users,);
