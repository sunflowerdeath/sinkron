import { MigrationInterface, QueryRunner } from "typeorm";

export class Initial1710591074633 implements MigrationInterface {
    name = 'Initial1710591074633'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user" ("id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "isDisabled" boolean NOT NULL, "name" varchar NOT NULL, "password" varchar NOT NULL, CONSTRAINT "UQ_065d4d8f3b5adb4a08841eae3c8" UNIQUE ("name"))`);
        await queryRunner.query(`CREATE TABLE "token" ("token" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "expiresAt" datetime, "lastAccess" datetime NOT NULL DEFAULT (datetime('now')), "client" varchar)`);
        await queryRunner.query(`CREATE INDEX "IDX_94f168faad896c0786646fa3d4" ON "token" ("userId") `);
        await queryRunner.query(`CREATE TABLE "space" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "ownerId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE TABLE "space_member" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "spaceId" varchar NOT NULL, "role" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_6bab1d3085d5e3b69456c81f66" ON "space_member" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c6700f460e6c6197d6b520394a" ON "space_member" ("spaceId") `);
        await queryRunner.query(`CREATE TABLE "invite" ("id" varchar PRIMARY KEY NOT NULL, "spaceId" varchar NOT NULL, "role" varchar NOT NULL, "fromId" varchar NOT NULL, "toId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "status" varchar NOT NULL, "isHidden" boolean NOT NULL)`);
        await queryRunner.query(`CREATE INDEX "IDX_0d683af0f9844ed115756f559f" ON "invite" ("fromId") `);
        await queryRunner.query(`CREATE INDEX "IDX_9f0e8951f9decd5a33d34f3357" ON "invite" ("toId") `);
        await queryRunner.query(`DROP INDEX "IDX_94f168faad896c0786646fa3d4"`);
        await queryRunner.query(`CREATE TABLE "temporary_token" ("token" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "expiresAt" datetime, "lastAccess" datetime NOT NULL DEFAULT (datetime('now')), "client" varchar, CONSTRAINT "FK_94f168faad896c0786646fa3d4a" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_token"("token", "userId", "createdAt", "expiresAt", "lastAccess", "client") SELECT "token", "userId", "createdAt", "expiresAt", "lastAccess", "client" FROM "token"`);
        await queryRunner.query(`DROP TABLE "token"`);
        await queryRunner.query(`ALTER TABLE "temporary_token" RENAME TO "token"`);
        await queryRunner.query(`CREATE INDEX "IDX_94f168faad896c0786646fa3d4" ON "token" ("userId") `);
        await queryRunner.query(`CREATE TABLE "temporary_space" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "ownerId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_5c9f1f9a773546f4393d1b8c9c9" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_space"("id", "name", "ownerId", "createdAt") SELECT "id", "name", "ownerId", "createdAt" FROM "space"`);
        await queryRunner.query(`DROP TABLE "space"`);
        await queryRunner.query(`ALTER TABLE "temporary_space" RENAME TO "space"`);
        await queryRunner.query(`DROP INDEX "IDX_6bab1d3085d5e3b69456c81f66"`);
        await queryRunner.query(`DROP INDEX "IDX_c6700f460e6c6197d6b520394a"`);
        await queryRunner.query(`CREATE TABLE "temporary_space_member" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "spaceId" varchar NOT NULL, "role" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_c6700f460e6c6197d6b520394a7" FOREIGN KEY ("spaceId") REFERENCES "space" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_6bab1d3085d5e3b69456c81f66c" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_space_member"("id", "userId", "spaceId", "role", "createdAt") SELECT "id", "userId", "spaceId", "role", "createdAt" FROM "space_member"`);
        await queryRunner.query(`DROP TABLE "space_member"`);
        await queryRunner.query(`ALTER TABLE "temporary_space_member" RENAME TO "space_member"`);
        await queryRunner.query(`CREATE INDEX "IDX_6bab1d3085d5e3b69456c81f66" ON "space_member" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c6700f460e6c6197d6b520394a" ON "space_member" ("spaceId") `);
        await queryRunner.query(`DROP INDEX "IDX_0d683af0f9844ed115756f559f"`);
        await queryRunner.query(`DROP INDEX "IDX_9f0e8951f9decd5a33d34f3357"`);
        await queryRunner.query(`CREATE TABLE "temporary_invite" ("id" varchar PRIMARY KEY NOT NULL, "spaceId" varchar NOT NULL, "role" varchar NOT NULL, "fromId" varchar NOT NULL, "toId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "status" varchar NOT NULL, "isHidden" boolean NOT NULL, CONSTRAINT "FK_743841b40e6160a14972f930676" FOREIGN KEY ("spaceId") REFERENCES "space" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_0d683af0f9844ed115756f559f4" FOREIGN KEY ("fromId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_9f0e8951f9decd5a33d34f3357a" FOREIGN KEY ("toId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_invite"("id", "spaceId", "role", "fromId", "toId", "createdAt", "updatedAt", "status", "isHidden") SELECT "id", "spaceId", "role", "fromId", "toId", "createdAt", "updatedAt", "status", "isHidden" FROM "invite"`);
        await queryRunner.query(`DROP TABLE "invite"`);
        await queryRunner.query(`ALTER TABLE "temporary_invite" RENAME TO "invite"`);
        await queryRunner.query(`CREATE INDEX "IDX_0d683af0f9844ed115756f559f" ON "invite" ("fromId") `);
        await queryRunner.query(`CREATE INDEX "IDX_9f0e8951f9decd5a33d34f3357" ON "invite" ("toId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_9f0e8951f9decd5a33d34f3357"`);
        await queryRunner.query(`DROP INDEX "IDX_0d683af0f9844ed115756f559f"`);
        await queryRunner.query(`ALTER TABLE "invite" RENAME TO "temporary_invite"`);
        await queryRunner.query(`CREATE TABLE "invite" ("id" varchar PRIMARY KEY NOT NULL, "spaceId" varchar NOT NULL, "role" varchar NOT NULL, "fromId" varchar NOT NULL, "toId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "status" varchar NOT NULL, "isHidden" boolean NOT NULL)`);
        await queryRunner.query(`INSERT INTO "invite"("id", "spaceId", "role", "fromId", "toId", "createdAt", "updatedAt", "status", "isHidden") SELECT "id", "spaceId", "role", "fromId", "toId", "createdAt", "updatedAt", "status", "isHidden" FROM "temporary_invite"`);
        await queryRunner.query(`DROP TABLE "temporary_invite"`);
        await queryRunner.query(`CREATE INDEX "IDX_9f0e8951f9decd5a33d34f3357" ON "invite" ("toId") `);
        await queryRunner.query(`CREATE INDEX "IDX_0d683af0f9844ed115756f559f" ON "invite" ("fromId") `);
        await queryRunner.query(`DROP INDEX "IDX_c6700f460e6c6197d6b520394a"`);
        await queryRunner.query(`DROP INDEX "IDX_6bab1d3085d5e3b69456c81f66"`);
        await queryRunner.query(`ALTER TABLE "space_member" RENAME TO "temporary_space_member"`);
        await queryRunner.query(`CREATE TABLE "space_member" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "spaceId" varchar NOT NULL, "role" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "space_member"("id", "userId", "spaceId", "role", "createdAt") SELECT "id", "userId", "spaceId", "role", "createdAt" FROM "temporary_space_member"`);
        await queryRunner.query(`DROP TABLE "temporary_space_member"`);
        await queryRunner.query(`CREATE INDEX "IDX_c6700f460e6c6197d6b520394a" ON "space_member" ("spaceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_6bab1d3085d5e3b69456c81f66" ON "space_member" ("userId") `);
        await queryRunner.query(`ALTER TABLE "space" RENAME TO "temporary_space"`);
        await queryRunner.query(`CREATE TABLE "space" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "ownerId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "space"("id", "name", "ownerId", "createdAt") SELECT "id", "name", "ownerId", "createdAt" FROM "temporary_space"`);
        await queryRunner.query(`DROP TABLE "temporary_space"`);
        await queryRunner.query(`DROP INDEX "IDX_94f168faad896c0786646fa3d4"`);
        await queryRunner.query(`ALTER TABLE "token" RENAME TO "temporary_token"`);
        await queryRunner.query(`CREATE TABLE "token" ("token" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "expiresAt" datetime, "lastAccess" datetime NOT NULL DEFAULT (datetime('now')), "client" varchar)`);
        await queryRunner.query(`INSERT INTO "token"("token", "userId", "createdAt", "expiresAt", "lastAccess", "client") SELECT "token", "userId", "createdAt", "expiresAt", "lastAccess", "client" FROM "temporary_token"`);
        await queryRunner.query(`DROP TABLE "temporary_token"`);
        await queryRunner.query(`CREATE INDEX "IDX_94f168faad896c0786646fa3d4" ON "token" ("userId") `);
        await queryRunner.query(`DROP INDEX "IDX_9f0e8951f9decd5a33d34f3357"`);
        await queryRunner.query(`DROP INDEX "IDX_0d683af0f9844ed115756f559f"`);
        await queryRunner.query(`DROP TABLE "invite"`);
        await queryRunner.query(`DROP INDEX "IDX_c6700f460e6c6197d6b520394a"`);
        await queryRunner.query(`DROP INDEX "IDX_6bab1d3085d5e3b69456c81f66"`);
        await queryRunner.query(`DROP TABLE "space_member"`);
        await queryRunner.query(`DROP TABLE "space"`);
        await queryRunner.query(`DROP INDEX "IDX_94f168faad896c0786646fa3d4"`);
        await queryRunner.query(`DROP TABLE "token"`);
        await queryRunner.query(`DROP TABLE "user"`);
    }

}
