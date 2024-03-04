import { DataSource } from "typeorm"
import { Sinkron } from "sinkron"

import { UsersController } from "./users"
import { SpacesController } from "./spaces"
import { InvitesController } from "./invites"

class Controller {
    sinkron: Sinkron
    users: UsersController
    spaces: SpacesController
    invites: InvitesController

    constructor(db: DataSource, sinkron: Sinkron) {
        this.sinkron = sinkron
        this.users = new UsersController(db, this)
        this.spaces = new SpacesController(db, this)
        this.invites = new InvitesController(db, this)
    }
}

export { Controller }
