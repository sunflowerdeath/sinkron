import { App } from "./app"

const run = async () => {
    const app = new App()
    await app.init() 
    app.start()
}

run()
