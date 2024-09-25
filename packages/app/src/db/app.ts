import path from "node:path"
import { DataSource } from "typeorm"

import { entities } from "../entities"

const dbDir =
    process.env.SINKRON_SQLITE_DB_DIR || path.join(__dirname, "../temp")

const dbPath =
    process.env.SINKRON_SQLITE_MEMORY_DB === "1"
        ? ":memory:"
        : path.join(dbDir, "paper.sqlite")

// @ts-expect-error require.context
const ctx = require.context("../migrations", true, /\.ts$/)
const migrations = ctx.keys().map((key: string) => {
    const module = ctx(key)
    return Object.values(module)[0]
})

const dataSource = new DataSource({
    type: "better-sqlite3",
    database: dbPath,
    synchronize: dbPath === ":memory:",
    entities,
    logging: true,
    // logging: ["error"],
    migrations
})

export default dataSource
