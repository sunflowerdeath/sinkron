import type { DbConfig } from "./db/dataSource"

export type S3Config = {
    host: string
}

export type SmtpConfig = {
    host: string
}

export type SinkronConfig = {
    db: DbConfig
    sinkron: { db: DbConfig }
    s3?: S3Config
    smtp?: SmtpConfig
}

const configStr = process.env.SINKRON_CONFIG
if (configStr === undefined || configStr.length === 0) {
    console.error('Config not found. Set env variable "SINKRON_CONFIG"')
    process.exit(1)
}
let config: SinkronConfig
try {
    config = JSON.parse(configStr)
} catch (e) {
    console.error("Couldn't parse config json:")
    console.error(process.env.SINKRON_CONFIG)
    process.exit(1)
}

export { config }
