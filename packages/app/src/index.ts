import path from "node:path"
import { Sinkron } from "sinkron"
import { App } from "./app"

const run = async () => {
    const dbPath = process.env.SINKRON_DB_PATH

    const sinkronDbPath =
        dbPath === undefined ? ":memory:" : path.join(dbPath, "sinkron.sqlite")
    const sinkron = new Sinkron({ dbPath: sinkronDbPath })
    await sinkron.init()

    const paperDbPath =
        dbPath === undefined ? ":memory:" : path.join(dbPath, "paper.sqlite")
    const app = new App({ sinkron, dbPath: paperDbPath })
    await app.init()

    let user
    const createUserResult = await app.controller.users.createUser(
        "test",
        "password"
    )
    if (createUserResult.isOk) {
        user = createUserResult.value
        console.log("Created user", user)
    }

    app.start()
}

run()
