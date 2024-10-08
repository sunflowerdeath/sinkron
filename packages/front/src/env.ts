// @ts-expect-error webpack var
const isProductionEnv = IS_PRODUCTION
// @ts-expect-error webpack var
const isTauri = IS_TAURI

const wsUrl = isProductionEnv
    ? "wss://api.sinkron.xyz"
    : `ws://${window.location.hostname}:80`

const apiUrl = isProductionEnv
    ? "https://api.sinkron.xyz"
    : "http://localhost:80"

const env = {
    isProductionEnv,
    wsUrl,
    apiUrl
}

export default env
