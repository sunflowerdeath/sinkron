// @ts-expect-error webpack var
const isProductionEnv = IS_PRODUCTION

const tauri = window.location.hostname === "tauri.localhost"

const wsUrl = isProductionEnv
    ? "wss://api.sinkron.xyz"
    : tauri
    ? "ws://10.0.2.2:80"
    : `ws://${window.location.hostname}:80`

const apiUrl = isProductionEnv
    ? "https://api.sinkron.xyz"
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
