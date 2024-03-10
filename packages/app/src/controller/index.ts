import { DataSource } from "typeorm"
import { Sinkron } from "sinkron"

import { UsersController } from "./users"
import { SpacesController } from "./spaces"
import { InvitesController } from "./invites"

import { AuthToken } from "../entities"

export interface RequestContext {
    token: AuthToken
}

export enum ErrorCode {
    // Invalid request format
    InvalidRequest = "invalid_request",

    // User could not be authenticated, connection will be closed
    AuthenticationFailed = "auth_failed",

    // User doesn't have permission to perform the operation
    AccessDenied = "access_denied",

    // Operation cannot be performed
    UnprocessableRequest = "unprocessable_request",

    // Requested entity not found
    NotFound = "not_found",

    InternalServerError = "internal_server_error"
}

export type RequestError = {
    code: ErrorCode
    details?: Object
    message?: string
}

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
