import path from "node:path"
import { DataSource } from "typeorm"

import { entities } from "./entities"

const createDataSource = () => {
    const dbDir =
        process.env.SINKRON_SQLITE_DB_DIR || path.join(__dirname, "../temp")
    const dbPath =
        process.env.SINKRON_SQLITE_MEMORY_DB === "1"
            ? ":memory:"
            : path.join(dbDir, "paper.sqlite")
    return new DataSource({
        type: "better-sqlite3",
        database: dbPath,
        synchronize: dbPath === ":memory:",
        entities,
        logging: ["error"],
        migrations: ["build/migrations/*.js"]
    })
}

export default createDataSource()
export { createDataSource }
