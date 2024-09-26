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

type S3Config = {
    host: string
}

type SmtpConfig = {
    host: string
}

export type SinkronConfig = {
    env: "production" | "development",
    db: {
        app: DbConfig,
        sinkron: DbConfig
    }
    s3?: S3Config,
    smtp?: SmtpConfig
}

const configStr = process.env.SINKRON_CONFIG
if (configStr === undefined || configStr.length === 0) {
    console.error("Config not found. Set env variable: 'SINKRON_CONFIG'")
    process.exit(1)
}
let config : SinkronConfig
try {
    config = JSON.parse(configStr)
} catch (e) {
    console.error("Couldn't parse config json:")
    console.error(process.env.SINKRON_CONFIG)
    process.exit(1)
}

export { config }
