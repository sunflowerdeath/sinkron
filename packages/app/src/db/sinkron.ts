import path from "node:path"
import { createDataSource } from "sinkron"

const dbDir =
    process.env.SINKRON_SQLITE_DB_DIR || path.join(__dirname, "../temp")

const dbPath =
    process.env.SINKRON_SQLITE_MEMORY_DB === "1"
        ? ":memory:"
        : path.join(dbDir, "sinkron.sqlite")

const dataSource = createDataSource(dbPath)

export default dataSource
export { dbPath }
