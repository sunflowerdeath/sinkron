import { DataSource } from "typeorm"

import { getEntities } from "./entities"

// @ts-ignore
const ctx = require.context("./migrations", true, /\.ts$/)
const migrations = ctx.keys().map((key: string) => {
    const module = ctx(key)
    return Object.values(module)[0]
})

export type PostgresConfig = {
    type: "postgres"
    host: string
    port: number
    username: string
    password: string
    database: string
    dropSchema?: boolean
    synchronize?: boolean
}

export type SqliteConfig = {
    type: "sqlite"
    database: string
    dropSchema?: boolean
    synchronize?: boolean
}

export type DbConfig = PostgresConfig | SqliteConfig

const createDataSource = (config: DbConfig) => {
    const entities = getEntities(config.type)
    if (config.type === "sqlite") {
        const { database, synchronize, dropSchema } = config
        return new DataSource({
            type: "sqlite",
            database,
            synchronize,
            dropSchema,
            entities,
            logging: ["error"]
        })
    } else {
        const {
            host,
            port,
            username,
            password,
            database,
            synchronize,
            dropSchema
        } = config
        return new DataSource({
            type: "postgres",
            host,
            port,
            username,
            password,
            database,
            entities,
            logging: ["error"],
            migrations,
            synchronize,
            dropSchema
        })
    }
}

export { createDataSource }
