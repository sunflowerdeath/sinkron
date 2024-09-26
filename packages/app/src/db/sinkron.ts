import { createDataSource } from "sinkron"

import { config } from "../config"

const dataSource = createDataSource(config.db.sinkron)

export default dataSource
