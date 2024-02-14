

    /*
    type User = {
    }

    type Group = {
    }

    type AuthToken = {
    }

    class Auth {
        createUser(props: UserProps) : Promise<Result<User, Error>>
        getUser(id: string) : Promise<Result<User, Error>>
        
        createUserGroup() : Promise<Result<Group, RequestError>>
        deleteUserGroup() : Promise<Result<true, RequestError>>
        getGroup(id: string) : Promise<Result<Group, RequestError>>
        addUserToGroup(id: string) : Promise<Result<true, RequestError>>
        removeUserFromGroup(id: string) : Promise<Result<true, RequestError>>
        
        issueAuthToken(id: string, props: AuthTokenSettings) : 
             Promise<Result<AuthToken, RequestError>>
        revokeAuthToken(token: string) : Promise<Result<true, RequestError>>
        getAuthToken(token: string, bumpLastActive: boolean) :
             Promise<Result<AuthToken, RequestError>>
        getActiveUserTokens(user: string) :
             Promise<Result<AuthToken[], RequestError>>
    }
    */

    /*
    const AuthServer = new AuthServer({
        db:
    })

    type User = {
        id: string
        displayName: string
    }

    type Group = {
        id: string
        members: User[]
    }

    type AuthToken = {
        token: string
        user: User
        createdAt: Date
        expiresAt: Date
        lastActive: Date
        client: string
    }

    enum ErrorCode {
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

        InternalServerError = "internal_server_error",
    }

    type RequestError = { code: ErrorCode; details?: string }

    type CollectionAction = "list" | "create" | "delete" | "admin"
    type DocumentAction = "read" | "edit" | "delete" | "admin"

    // const colid = `spaces/${id}/guest/${user.id}`
    // await createSubCollection(colid, { parent: `spaces/${id}` })
    // await setCollectionPermissions(colid, (p) => {
    //      p.add(user.id, "read")
    // })
    // await addDocumentToCollection(doc, colid)
    // await removeDocumentFromCollection(doc, colid)
    // await setDocumentPermissions(doc, (p) => {
    //      p.add(user.id, "read" | "update")
    // })

    interface Sinkron {
        createUser(id?) : Promise<User>
        getUser(id: string) : Promise<User>

        issueAuthToken(user: string) : Promise<Result<AuthToken, RequestError>>
        revokeAuthToken(token: string) : Promise<Result<true, RequestError>>
        checkAuthToken(token: string, bumpLastActive: boolean) :
            Promise<Result<AuthToken, RequestError>>
        getUserActiveTokens(user: string) :
            Promise<Result<AuthToken[], RequestError>>

        createGroup(id: string) : Promise<Result<Group, RequestError>>
        deleteGroup(id: string) : Promise<Result<true, RequestError>>
        getGroup(id: string) : Promise<Result<Group, RequestError>>
        addUserToGroup(group: string, user: string) 
            : Promise<Result<true, RequestError>>
        removeUserFromGroup(group: string, user: string) 
            : Promise<Result<true, RequestError>>

        createCollection(id: string) : Promise<Result<Collection, RequestError>>
        deleteCollection(id: string) : Promise<Result<true, RequestError>>

        createDocument() : Promise<Result<Document, RequestError>>
        deleteDocument(id: string) : Promise<Result<true, RequestError>>
        updateDocument()
        updateDocumentWithCallback()

        updateDocumentPermissions(doc: string, cb: function) :
            Promise<Result<true, RequestError>>  
        checkDocPermission(doc: string, user: string, action: Action) :
            Promise<Result<boolean, RequestError>>
        updateCollectionPermissions(doc: string, cb: function) :
            Promise<Result<true, RequestError>>
        checkCollectionPermission(doc: string, user: string, action: Action) :
            Promise<Result<boolean, RequestError>>
    }

    type Space = {
        id: string
        name: string
        owner: User
    }

    type Role = "admin" | "editor" | "viewer" | "guest"

    type Member = {
        user: string
        space: string
        role: Role
    }

    // TODO invites

    /*
    app
        register
            await sinkron.createUser
            const space = await spaces.insert({ ... })
            await sinkron.createCollection(`spaces/${space.id}`)
            await sinkron.createGroup(`spaces/${space.id}/admins`)
            await sinkron.createGroup(`spaces/${space.id}/editors`)
            await sinkron.createGroup(`spaces/${space.id}/viewers`)
            await sinkron.addUserToGroup(user.id, `spaces/${space.id}/admins`)

        login
            await sinkron.authToken()
            setCookie("token", token.token)
            ctx.user = user

        auth middleware
            const token = ctx.getCookie("token")
            await sinkron.verifyAuthToken(token)
            ctx.user = user

        ...
    */



