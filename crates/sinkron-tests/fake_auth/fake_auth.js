const http = require("http")

// For any provided token "token-<ID>" authorizes it as "user-<ID>"
const server = http.createServer((req, res) => {
    if (req.method !== "POST") {
        res.writeHead(404)
        res.end()
    }
    const match = req.url.match(/^\/token-(.+)$/)
    if (match === null) {
        console.log(`Couldn't authorize, token: ${req.url}`);
        res.writeHead(401)
        res.end()
    } else {
        const id = match[1]
        console.log(`Authorized user: user-${id}`);
        res.writeHead(200, { "Content-type": "text/plain" })
        res.end(`user-${id}`)
    }
})

server.listen(80)
