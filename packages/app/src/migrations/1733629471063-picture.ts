import { MigrationInterface, QueryRunner } from "typeorm";

export class Picture1733629471063 implements MigrationInterface {
    name = 'Picture1733629471063'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD "picture" character varying NOT NULL DEFAULT '{"color":"grey","emoji":"slightly_smiling_face"}'`);
        await queryRunner.query(`ALTER TABLE "space" ADD "picture" character varying NOT NULL DEFAULT '{"color":"grey","emoji":"file_cabinet"}'`);
        await queryRunner.query(`ALTER TABLE "user" ADD CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22"`);
        await queryRunner.query(`ALTER TABLE "space" DROP COLUMN "picture"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "picture"`);
    }

}
