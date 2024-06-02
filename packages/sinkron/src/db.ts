import path from "node:path"
import { DataSource } from "typeorm"

import { entities } from "./entities"

// @ts-ignore
const ctx = require.context("./migrations", true, /\.ts$/)
const migrations = ctx.keys().map((key: string) => {
    const module = ctx(key)
    return Object.values(module)[0]
})

const createDataSource = (dbPath: string) => {
    return new DataSource({
        type: "better-sqlite3",
        database: dbPath,
        synchronize: dbPath === ":memory:",
        entities,
        logging: ["error"],
        migrations
    })
}

export { createDataSource }
