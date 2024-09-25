import { App } from "./app"

const run = async () => {
    const app = new App({})
    await app.init()

    let user
    const createUserRes = await app.services.users.create(
        app.models,
        "test@sinkron.xyz"
    )
    if (createUserRes.isOk) {
        user = createUserRes.value
        console.log("Created user", user)
    }

    app.start()
}

run()
