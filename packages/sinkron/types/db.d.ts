import { DataSource } from "typeorm";
declare const createDataSource: (dbPath: string) => DataSource;
export { createDataSource };
