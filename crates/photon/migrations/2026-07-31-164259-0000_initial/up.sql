CREATE TABLE "users" (
    "id" uuid NOT NULL PRIMARY KEY,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "email" text NOT NULL UNIQUE,
    "is_disabled" boolean NOT NULL DEFAULT false,
    "picture" text NOT NULL
);

CREATE TABLE "otps" (
    "id" uuid NOT NULL PRIMARY KEY,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "email" text NOT NULL,
    "code" text NOT NULL,
    "attempts" smallint NOT NULL DEFAULT 0
);

CREATE TABLE "auth_tokens" (
    "token" text NOT NULL PRIMARY KEY,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "expires_at" timestamp with time zone,
    "last_access" timestamp with time zone NOT NULL DEFAULT now(),
    "client_string" text NOT NULL,
    "user_id" uuid NOT NULL,
    CONSTRAINT auth_tokens_fk_user_id
        FOREIGN KEY ("user_id") REFERENCES "users"("id") 
            ON DELETE NO ACTION ON UPDATE NO ACTION
);

