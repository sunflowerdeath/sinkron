const domains = {
    front: "sinkr0n.xyz",
    app: "app.sinkr0n.xyz",
    sinkron: "sync.sinkr0n.xyz"
}

const isProductionEnv = process.env.NODE_ENV === "production"

const tauri = window.location.hostname === "tauri.localhost"

const wsUrl = isProductionEnv
    ? `wss://${domains.sinkron}/sync`
    : tauri
    ? "ws://10.0.2.2:3333/sync"
    : `ws://${window.location.hostname}:3333/sync`

const apiUrl = isProductionEnv
    ? `https://${domains.app}`
    : tauri
    ? "http://10.0.2.2:80"
    : `http://${window.location.hostname}:80`

const frontUrl = isProductionEnv ? `https://${domains.front}` : location.origin

const env = {
    isProductionEnv,
    tauri,
    wsUrl,
    apiUrl,
    frontUrl
}

export default env
