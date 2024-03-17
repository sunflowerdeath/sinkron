import { MigrationInterface, QueryRunner } from "typeorm";

export class HasUnreadNotifications1710682892063 implements MigrationInterface {
    name = 'HasUnreadNotifications1710682892063'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD "hasUnreadNotifications" boolean`);
        await queryRunner.query(`UPDATE user SET "hasUnreadNotifications" = false`)
        await queryRunner.query(`CREATE TABLE "temporary_user" ("id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "isDisabled" boolean NOT NULL, "name" varchar NOT NULL, "password" varchar NOT NULL, "hasUnreadNotifications" boolean NOT NULL, CONSTRAINT "UQ_065d4d8f3b5adb4a08841eae3c8" UNIQUE ("name"))`);
        await queryRunner.query(`INSERT INTO "temporary_user"("id", "createdAt", "isDisabled", "name", "password", "hasUnreadNotifications") SELECT "id", "createdAt", "isDisabled", "name", "password", "hasUnreadNotifications" FROM "user"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`ALTER TABLE "temporary_user" RENAME TO "user"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
    }

}
