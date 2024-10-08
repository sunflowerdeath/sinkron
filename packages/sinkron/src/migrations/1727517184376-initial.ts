import { MigrationInterface, QueryRunner } from "typeorm";

export class Initial1727517184376 implements MigrationInterface {
    name = 'Initial1727517184376'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "document" ("id" uuid NOT NULL, "rev" integer NOT NULL, "data" bytea, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isDeleted" boolean NOT NULL, "permissions" character varying NOT NULL, "colrev" integer NOT NULL, "colId" character varying NOT NULL, CONSTRAINT "PK_e57d3357f83f3cdc0acffc3d777" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_68cc975d9ce6f83a4e135117aa" ON "document" ("colId", "colrev") `);
        await queryRunner.query(`CREATE TABLE "collection" ("id" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "colrev" integer NOT NULL, "permissions" character varying NOT NULL, "ref" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_ad3f485bbc99d875491f44d7c85" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ref" ("id" uuid NOT NULL, "isRemoved" boolean NOT NULL, "colrev" integer NOT NULL, "colId" character varying NOT NULL, "docId" uuid NOT NULL, CONSTRAINT "PK_1869dabd26c52d6364ef6e3b1eb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_335ac93dc17d3acaf8fd379ab3" ON "ref" ("docId") `);
        await queryRunner.query(`CREATE INDEX "IDX_a12285873142dde17dc828137c" ON "ref" ("colId", "colrev") `);
        await queryRunner.query(`CREATE TABLE "group" ("id" character varying NOT NULL, CONSTRAINT "PK_256aa0fda9b1de1a73ee0b7106b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "group_member" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user" character varying NOT NULL, "groupId" character varying NOT NULL, CONSTRAINT "PK_65634517a244b69a8ef338d03c3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fbfccdaa397eee67e4f1fff02c" ON "group_member" ("user") `);
        await queryRunner.query(`ALTER TABLE "document" ADD CONSTRAINT "FK_f2bcb96c005d38b5086b8aa01b1" FOREIGN KEY ("colId") REFERENCES "collection"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ref" ADD CONSTRAINT "FK_dea591985fc086e63374224cf49" FOREIGN KEY ("colId") REFERENCES "collection"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "ref" ADD CONSTRAINT "FK_335ac93dc17d3acaf8fd379ab30" FOREIGN KEY ("docId") REFERENCES "document"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "group_member" ADD CONSTRAINT "FK_44c8964c097cf7f71434d6d1122" FOREIGN KEY ("groupId") REFERENCES "group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "group_member" DROP CONSTRAINT "FK_44c8964c097cf7f71434d6d1122"`);
        await queryRunner.query(`ALTER TABLE "ref" DROP CONSTRAINT "FK_335ac93dc17d3acaf8fd379ab30"`);
        await queryRunner.query(`ALTER TABLE "ref" DROP CONSTRAINT "FK_dea591985fc086e63374224cf49"`);
        await queryRunner.query(`ALTER TABLE "document" DROP CONSTRAINT "FK_f2bcb96c005d38b5086b8aa01b1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fbfccdaa397eee67e4f1fff02c"`);
        await queryRunner.query(`DROP TABLE "group_member"`);
        await queryRunner.query(`DROP TABLE "group"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a12285873142dde17dc828137c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_335ac93dc17d3acaf8fd379ab3"`);
        await queryRunner.query(`DROP TABLE "ref"`);
        await queryRunner.query(`DROP TABLE "collection"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_68cc975d9ce6f83a4e135117aa"`);
        await queryRunner.query(`DROP TABLE "document"`);
    }

}
