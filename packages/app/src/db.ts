import path from "node:path"
import { DataSource } from "typeorm"
import { DataSourceOptions } from "typeorm/data-source/DataSourceOptions"

import { entities } from "./entities"

const dbPath = process.env.SINKRON_DB_PATH
    ? path.join(process.env.SINKRON_DB_PATH, "paper.sqlite")
    : path.join(__dirname, "../temp/paper.sqlite")

const options: DataSourceOptions = {
    type: "better-sqlite3",
    database: dbPath,
    entities,
    logging: ["error"],
    migrations: ["build/migrations/*.js"]
}

export default new DataSource(options)
