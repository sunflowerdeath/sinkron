import { createServer } from "node:http"

import { Sinkron, SinkronServer, Permissions, Role, Action } from "sinkron"
import pino, { Logger } from "pino"

const numCols = 100
const numUsers = numCols * 2
const port = 8081

const startServer = async () => {
    const sinkron = new Sinkron({
        db: {
            type: "postgres",
            host: "0.0.0.0",
            port: 5432,
            username: "postgres",
            password: "password",
            database: "sinkron_benchmark",
            dropSchema: true,
            synchronize: true
        }
    })
    // const sinkron = new Sinkron({
        // db: { type: "sqlite", database: ":memory:", synchronize: true }
    // })
    await sinkron.init()

    await sinkron.createGroup("benchmark")

    for (let i = 0; i < numUsers; i++) {
        await sinkron.addMemberToGroup(`user-${i}`, "benchmark")
    }

    for (let i = 0; i < numCols; i++) {
        const colid = `cols/${i}`
        const permissions = new Permissions()
        permissions.add(Action.read, Role.group("benchmark"))
        permissions.add(Action.create, Role.group("benchmark"))
        permissions.add(Action.delete, Role.group("benchmark"))
        permissions.add(Action.update, Role.group("benchmark"))
        await sinkron.createCollection({
            id: colid,
            permissions: permissions.table
        })
    }

    const logger: Logger<string> = pino({
        transport: { target: "pino-pretty" }
    })
    logger.level = "debug"
    const sinkronServer = new SinkronServer({ sinkron, logger, sync: false })
    const http = createServer()
    http.on("upgrade", (request, socket, head) => {
        const userId = request.url!.slice(1)
        const user = { id: userId }
        sinkronServer.upgrade(request, socket, head, user)
    })
    http.listen(port, () => {
        console.log(`Server started at port: ${port}`)
    })

    const report = () => {
        console.log(sinkronServer.report())
        setTimeout(report, 3000)
    }
    setTimeout(report, 3000)
}

startServer()
