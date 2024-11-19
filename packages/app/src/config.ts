import type { S3Config } from "./files/s3"

export type DbConfig = {
    host: string
    port: number
    username: string
    password: string
    database: string
}

export type StorageConfig =
    | { type: "local"; path: string }
    | ({ type: "s3" } & S3Config)

export type SmtpConfig = {
    type: "smtp"
    host: string
    port: number
    secure: boolean
    user: string
    password: string
}

export type MailConfig = { type: "console" } | SmtpConfig

export type SinkronConfig = {
    url: string
    token: string
}

export type SinkronAppConfig = {
    db: DbConfig
    storage: StorageConfig
    mail: MailConfig
    sinkron: SinkronConfig
}

const configStr = process.env.SINKRON_CONFIG
if (configStr === undefined || configStr.length === 0) {
    console.error('Config not found. Set env variable "SINKRON_CONFIG"')
    process.exit(1)
}
let config: SinkronAppConfig
try {
    config = JSON.parse(configStr)
} catch {
    console.error("Couldn't parse config json:")
    console.error(process.env.SINKRON_CONFIG)
    process.exit(1)
}

export { config }
