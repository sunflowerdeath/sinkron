import { config } from "../config"

import { createDataSource } from "./dataSource"

const dataSource = createDataSource(config.db)

export default dataSource
