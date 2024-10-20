import { DataSource } from "typeorm"

import { entities } from "../entities"

export type DbConfig = {
    host: string
    port: number
    username: string
    password: string
    database: string
    synchronize?: boolean
    dropSchema?: boolean
}

// @ts-expect-error require.context
const ctx = require.context("../migrations", true, /\.ts$/)
const migrations = ctx.keys().map((key: string) => {
    const module = ctx(key)
    return Object.values(module)[0]
})

const createDataSource = (config: DbConfig) => {
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

export { createDataSource }
