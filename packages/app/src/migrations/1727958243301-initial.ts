import { MigrationInterface, QueryRunner } from "typeorm";

export class Initial1727958243301 implements MigrationInterface {
    name = 'Initial1727958243301'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying NOT NULL, "isDisabled" boolean NOT NULL, "hasUnreadNotifications" boolean NOT NULL, CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON "user" ("email") `);
        await queryRunner.query(`CREATE TABLE "otp" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying NOT NULL, "attempts" integer NOT NULL, CONSTRAINT "PK_32556d9d7b22031d7d0e1fd6723" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_463cf01e0ea83ad57391fd4e1d" ON "otp" ("email") `);
        await queryRunner.query(`CREATE TABLE "token" ("token" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP WITH TIME ZONE, "lastAccess" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "client" character varying, CONSTRAINT "PK_d9959ee7e17e2293893444ea371" PRIMARY KEY ("token"))`);
        await queryRunner.query(`CREATE INDEX "IDX_94f168faad896c0786646fa3d4" ON "token" ("userId") `);
        await queryRunner.query(`CREATE TABLE "space" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "ownerId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "usedStorage" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_094f5ec727fe052956a11623640" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "space_member" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "spaceId" uuid NOT NULL, "role" character varying NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_11ebe76f334b83775730cb38f7e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6bab1d3085d5e3b69456c81f66" ON "space_member" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c6700f460e6c6197d6b520394a" ON "space_member" ("spaceId") `);
        await queryRunner.query(`CREATE TABLE "invite" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "spaceId" uuid NOT NULL, "role" character varying NOT NULL, "fromId" uuid NOT NULL, "toId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "status" character varying NOT NULL, "isHidden" boolean NOT NULL, CONSTRAINT "PK_fc9fa190e5a3c5d80604a4f63e1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0d683af0f9844ed115756f559f" ON "invite" ("fromId") `);
        await queryRunner.query(`CREATE INDEX "IDX_9f0e8951f9decd5a33d34f3357" ON "invite" ("toId") `);
        await queryRunner.query(`CREATE TABLE "file" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "spaceId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "size" integer NOT NULL, CONSTRAINT "PK_36b46d232307066b3a2c9ea3a1d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "post" ("docId" uuid NOT NULL, "spaceId" uuid NOT NULL, "content" character varying NOT NULL, "publishedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5f6af3a0e20bb22a045ecb4001c" PRIMARY KEY ("docId"))`);
        await queryRunner.query(`ALTER TABLE "token" ADD CONSTRAINT "FK_94f168faad896c0786646fa3d4a" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "space" ADD CONSTRAINT "FK_5c9f1f9a773546f4393d1b8c9c9" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "space_member" ADD CONSTRAINT "FK_c6700f460e6c6197d6b520394a7" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "space_member" ADD CONSTRAINT "FK_6bab1d3085d5e3b69456c81f66c" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invite" ADD CONSTRAINT "FK_743841b40e6160a14972f930676" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invite" ADD CONSTRAINT "FK_0d683af0f9844ed115756f559f4" FOREIGN KEY ("fromId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invite" ADD CONSTRAINT "FK_9f0e8951f9decd5a33d34f3357a" FOREIGN KEY ("toId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "file" ADD CONSTRAINT "FK_ac699fb1056331a8cee125ce91f" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "post" ADD CONSTRAINT "FK_899a1931431768b2800f695ac60" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "post" DROP CONSTRAINT "FK_899a1931431768b2800f695ac60"`);
        await queryRunner.query(`ALTER TABLE "file" DROP CONSTRAINT "FK_ac699fb1056331a8cee125ce91f"`);
        await queryRunner.query(`ALTER TABLE "invite" DROP CONSTRAINT "FK_9f0e8951f9decd5a33d34f3357a"`);
        await queryRunner.query(`ALTER TABLE "invite" DROP CONSTRAINT "FK_0d683af0f9844ed115756f559f4"`);
        await queryRunner.query(`ALTER TABLE "invite" DROP CONSTRAINT "FK_743841b40e6160a14972f930676"`);
        await queryRunner.query(`ALTER TABLE "space_member" DROP CONSTRAINT "FK_6bab1d3085d5e3b69456c81f66c"`);
        await queryRunner.query(`ALTER TABLE "space_member" DROP CONSTRAINT "FK_c6700f460e6c6197d6b520394a7"`);
        await queryRunner.query(`ALTER TABLE "space" DROP CONSTRAINT "FK_5c9f1f9a773546f4393d1b8c9c9"`);
        await queryRunner.query(`ALTER TABLE "token" DROP CONSTRAINT "FK_94f168faad896c0786646fa3d4a"`);
        await queryRunner.query(`DROP TABLE "post"`);
        await queryRunner.query(`DROP TABLE "file"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9f0e8951f9decd5a33d34f3357"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0d683af0f9844ed115756f559f"`);
        await queryRunner.query(`DROP TABLE "invite"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c6700f460e6c6197d6b520394a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6bab1d3085d5e3b69456c81f66"`);
        await queryRunner.query(`DROP TABLE "space_member"`);
        await queryRunner.query(`DROP TABLE "space"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_94f168faad896c0786646fa3d4"`);
        await queryRunner.query(`DROP TABLE "token"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_463cf01e0ea83ad57391fd4e1d"`);
        await queryRunner.query(`DROP TABLE "otp"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e12875dfb3b1d92d7d7c5377e2"`);
        await queryRunner.query(`DROP TABLE "user"`);
    }

}
