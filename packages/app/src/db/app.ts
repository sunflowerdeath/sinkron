import { DataSource } from "typeorm"

import { entities } from "../entities"
import { config } from "../config"

// @ts-expect-error require.context
const ctx = require.context("../migrations", true, /\.ts$/)
const migrations = ctx.keys().map((key: string) => {
    const module = ctx(key)
    return Object.values(module)[0]
})

let dataSource: DataSource

const db = config.db.app
if (db.type === "sqlite") {
    dataSource = new DataSource({
        type: "better-sqlite3",
        database: db.database,
        synchronize: db.database === ":memory:",
        entities,
        logging: ["error"],
        migrations
    })
} else {
    const { host, port, username, password, database } = db
    dataSource = new DataSource({
        type: "postgres",
        host,
        port,
        username,
        password,
        database,
        entities,
        logging: ["error"],
        migrations
    })
}

export default dataSource
