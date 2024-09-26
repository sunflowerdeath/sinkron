import path from "node:path"
import { DataSource } from "typeorm"

import { entities } from "./entities"

// @ts-ignore
const ctx = require.context("./migrations", true, /\.ts$/)
const migrations = ctx.keys().map((key: string) => {
    const module = ctx(key)
    return Object.values(module)[0]
})

export type SqliteConfig = {
    type: "sqlite"
    database: string
}

export type PostgresConfig = {
    type: "postgres"
    host: string
    port: number
    username: string
    password: string
    database: string
}

export type DbConfig = SqliteConfig | PostgresConfig

const createDataSource = (config: DbConfig) => {
    if (config.type === "sqlite") {
        return new DataSource({
            type: "better-sqlite3",
            database: config.database,
            synchronize: config.database === ":memory:",
            entities,
            logging: ["error"],
            migrations
        })
    } else {
        const { host, port, username, password, database } = config
        return new DataSource({
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
}

export { createDataSource }
