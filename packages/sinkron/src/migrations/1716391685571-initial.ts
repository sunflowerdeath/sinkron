import { MigrationInterface, QueryRunner } from "typeorm";

export class Initial1716391685571 implements MigrationInterface {
    name = 'Initial1716391685571'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "document" ("id" varchar PRIMARY KEY NOT NULL, "rev" integer NOT NULL, "data" blob, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "isDeleted" boolean NOT NULL, "permissions" varchar NOT NULL, "colrev" integer NOT NULL, "colId" varchar NOT NULL)`);
        await queryRunner.query(`CREATE TABLE "collection" ("id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "colrev" integer NOT NULL, "permissions" varchar NOT NULL)`);
        await queryRunner.query(`CREATE TABLE "group" ("id" varchar PRIMARY KEY NOT NULL)`);
        await queryRunner.query(`CREATE TABLE "group_member" ("id" varchar PRIMARY KEY NOT NULL, "user" varchar NOT NULL, "groupId" varchar NOT NULL)`);
        await queryRunner.query(`CREATE TABLE "temporary_document" ("id" varchar PRIMARY KEY NOT NULL, "rev" integer NOT NULL, "data" blob, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "isDeleted" boolean NOT NULL, "permissions" varchar NOT NULL, "colrev" integer NOT NULL, "colId" varchar NOT NULL, CONSTRAINT "FK_f2bcb96c005d38b5086b8aa01b1" FOREIGN KEY ("colId") REFERENCES "collection" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_document"("id", "rev", "data", "createdAt", "updatedAt", "isDeleted", "permissions", "colrev", "colId") SELECT "id", "rev", "data", "createdAt", "updatedAt", "isDeleted", "permissions", "colrev", "colId" FROM "document"`);
        await queryRunner.query(`DROP TABLE "document"`);
        await queryRunner.query(`ALTER TABLE "temporary_document" RENAME TO "document"`);
        await queryRunner.query(`CREATE TABLE "temporary_group_member" ("id" varchar PRIMARY KEY NOT NULL, "user" varchar NOT NULL, "groupId" varchar NOT NULL, CONSTRAINT "FK_44c8964c097cf7f71434d6d1122" FOREIGN KEY ("groupId") REFERENCES "group" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_group_member"("id", "user", "groupId") SELECT "id", "user", "groupId" FROM "group_member"`);
        await queryRunner.query(`DROP TABLE "group_member"`);
        await queryRunner.query(`ALTER TABLE "temporary_group_member" RENAME TO "group_member"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "group_member" RENAME TO "temporary_group_member"`);
        await queryRunner.query(`CREATE TABLE "group_member" ("id" varchar PRIMARY KEY NOT NULL, "user" varchar NOT NULL, "groupId" varchar NOT NULL)`);
        await queryRunner.query(`INSERT INTO "group_member"("id", "user", "groupId") SELECT "id", "user", "groupId" FROM "temporary_group_member"`);
        await queryRunner.query(`DROP TABLE "temporary_group_member"`);
        await queryRunner.query(`ALTER TABLE "document" RENAME TO "temporary_document"`);
        await queryRunner.query(`CREATE TABLE "document" ("id" varchar PRIMARY KEY NOT NULL, "rev" integer NOT NULL, "data" blob, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "isDeleted" boolean NOT NULL, "permissions" varchar NOT NULL, "colrev" integer NOT NULL, "colId" varchar NOT NULL)`);
        await queryRunner.query(`INSERT INTO "document"("id", "rev", "data", "createdAt", "updatedAt", "isDeleted", "permissions", "colrev", "colId") SELECT "id", "rev", "data", "createdAt", "updatedAt", "isDeleted", "permissions", "colrev", "colId" FROM "temporary_document"`);
        await queryRunner.query(`DROP TABLE "temporary_document"`);
        await queryRunner.query(`DROP TABLE "group_member"`);
        await queryRunner.query(`DROP TABLE "group"`);
        await queryRunner.query(`DROP TABLE "collection"`);
        await queryRunner.query(`DROP TABLE "document"`);
    }

}
