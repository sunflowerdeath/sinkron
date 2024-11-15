const http = require("http")

const server = http.createServer((req, res) => {
    if (req.method !== "POST") {
        res.writeHead(404)
        res.end()
    }
    const match = req.url.match(/^\/token-(.+)$/)
    if (match === null) {
        res.writeHead(401)
        res.end()
    } else {
        const id = match[1]
        res.writeHead(200, { "Content-type": "text/plain" })
        res.end(`user-${id}`)
    }
})

server.listen(80)
