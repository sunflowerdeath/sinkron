import { createServer } from "node:http"

import { Sinkron, SinkronServer } from "../index"
import { Permissions, Role, Action } from "../permissions"

const numCols = 10
const numUsers = 100
const port = 8081

const startServer = async () => {
    const sinkron = new Sinkron({ dbPath: ":memory:" })
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

    const sinkronServer = new SinkronServer({ sinkron })
    const http = createServer()
    http.on("upgrade", (request, socket, head) => {
        const userId = request.url!.slice(1)
        const user = { id: userId }
        sinkronServer.upgrade(request, socket, head, user)
    })
    http.listen(port, () => {
        console.log(`Server started at port: ${port}`)
    })
}

startServer()
