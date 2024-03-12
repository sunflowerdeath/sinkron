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
    const createUserRes = await app.services.users.createUser(app.models, {
        name: "test",
        password: "password"
    })
    if (createUserRes.isOk) {
        user = createUserRes.value
        console.log("Created user", user)
    }

    app.start()
}

run()
