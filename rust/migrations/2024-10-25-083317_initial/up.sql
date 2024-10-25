CREATE TABLE "collections" (
    "id" text NOT NULL,
    "ref" boolean NOT NULL DEFAULT false,
    "colrev" bigint NOT NULL,
    "permissions" text NOT NULL,
    CONSTRAINT collections_pk PRIMARY KEY ("id")
);

CREATE TABLE "documents" (
    "id" uuid NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "col" text NOT NULL,
    "colrev" bigint NOT NULL,
    "data" bytea,
    "is_deleted" boolean NOT NULL DEFAULT false,
    "permissions" text NOT NULL,
    CONSTRAINT documents_pk PRIMARY KEY ("id"),
    CONSTRAINT documents_fk_col
        FOREIGN KEY ("col") REFERENCES "collections"("id") 
            ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX ON "documents" ("col", "colrev");

CREATE TABLE "refs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "is_removed" boolean NOT NULL DEFAULT false,
    "colrev" bigint NOT NULL,
    "col" text NOT NULL,
    "doc" uuid NOT NULL,
    CONSTRAINT refs_pk PRIMARY KEY ("id"),
    CONSTRAINT refs_fk_col
        FOREIGN KEY ("col") REFERENCES "collections"("id") 
            ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT refs_fk_doc
        FOREIGN KEY ("doc") REFERENCES "documents"("id") 
            ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX ON "refs" ("doc");
CREATE INDEX ON "refs" ("col", "colrev");

CREATE TABLE "groups" (
    "id" text NOT NULL,
    CONSTRAINT groups_pk PRIMARY KEY ("id")
);

CREATE TABLE "members" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "group" text NOT NULL,
    "user" text NOT NULL,
    CONSTRAINT members_pk PRIMARY KEY ("id"),
    CONSTRAINT members_fk_group
        FOREIGN KEY ("group") REFERENCES "groups"("id") 
            ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX ON "members" ("user");
