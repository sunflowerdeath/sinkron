const isProductionEnv = process.env.NODE_ENV === "production"

const tauri = window.location.hostname === "tauri.localhost"

const wsUrl = isProductionEnv
    ? "wss://sync.sinkron.xyz/sync"
    : tauri
    ? "ws://10.0.2.2:3333/sync"
    : `ws://${window.location.hostname}:3333/sync`

const apiUrl = isProductionEnv
    ? "https://app.sinkron.xyz"
    : tauri
    ? "http://10.0.2.2:80"
    : `http://${window.location.hostname}:80`

const env = {
    isProductionEnv,
    tauri,
    wsUrl,
    apiUrl
}

export default env
