import path from "node:path"
import { Sinkron } from "sinkron"
import { App } from "./app"

const run = async () => {
    const sinkronDbPath = process.env.SINKRON_DB_PATH
        ? path.join(process.env.SINKRON_DB_PATH, "sinkron.sqlite")
        : path.join(__dirname, "../temp/sinkron.sqlite")
    const sinkron = new Sinkron({ dbPath: sinkronDbPath })
    await sinkron.init()

    const app = new App({ sinkron })
    await app.init()

    let user
    const createUserRes = await app.services.users.create(app.models, {
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
