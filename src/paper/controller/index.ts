import { DataSource } from 'typeorm'
import { Sinkron } from "../../sinkron/sinkron"

import { UsersController } from "./users"
import { SpacesController } from "./spaces"

class Controller {
    sinkron: Sinkron
    users: UsersController 
    spaces: SpacesController 

    constructor(db: DataSource, sinkron: Sinkron) {
        this.sinkron = sinkron
        this.users = new UsersController(db, this)
        this.spaces = new SpacesController(db, this)
    }
}

export { Controller }
