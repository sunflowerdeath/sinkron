import { DataSource } from "typeorm"

import { config, DbConfig } from "./config"
import { entities } from "./entities"

// @ts-expect-error require.context
const ctx = require.context("./migrations", true, /\.ts$/)
const migrations = ctx.keys().map((key: string) => {
    const module = ctx(key)
    return Object.values(module)[0]
})

const createDataSource = (config: DbConfig) => {
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

const dataSource = createDataSource(config.db)

export default dataSource
