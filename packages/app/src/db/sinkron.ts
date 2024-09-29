import { createDataSource } from "sinkron"

import { config } from "../config"

const dataSource = createDataSource(config.sinkron.db)

export default dataSource
