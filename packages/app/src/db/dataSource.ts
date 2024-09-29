import { DataSource } from "typeorm"

import { entities } from "../entities"

export type PostgresConfig = {
    type: "postgres"
    host: string
    port: number
    username: string
    password: string
    database: string
}

export type SqliteConfig = {
    type: "sqlite"
    database: string
    synchronize?: boolean
}

export type DbConfig = PostgresConfig | SqliteConfig

// @ts-expect-error require.context
const ctx = require.context("../migrations", true, /\.ts$/)
const migrations = ctx.keys().map((key: string) => {
    const module = ctx(key)
    return Object.values(module)[0]
})

const createDataSource = (config: DbConfig) => {
    if (config.type === "sqlite") {
        const { database, synchronize } = config
        return new DataSource({
            type: "better-sqlite3",
            database,
            synchronize,
            entities,
            logging: ["error"]
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
