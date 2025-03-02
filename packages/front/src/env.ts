const domain = "sinkron.xyz"

const isProductionEnv = process.env.NODE_ENV === "production"

const tauri = window.location.hostname === "tauri.localhost"

const wsUrl = isProductionEnv
    ? `wss://sync.${domain}/sync`
    : tauri
    ? "ws://10.0.2.2:3333/sync"
    : `ws://${window.location.hostname}:3333/sync`

const apiUrl = isProductionEnv
    ? `https://app.${domain}`
    : tauri
    ? "http://10.0.2.2:80"
    : `http://${window.location.hostname}:80`

const frontUrl = isProductionEnv ? `https://${domain}` : location.origin

// TODO use front url instead
const linksOrigin = isProductionEnv ? `https://new.${domain}` : location.origin

const env = {
    isProductionEnv,
    tauri,
    wsUrl,
    apiUrl,
    frontUrl,
    linksOrigin
}

export default env
