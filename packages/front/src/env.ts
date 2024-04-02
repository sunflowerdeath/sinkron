const isProductionEnv = IS_PRODUCTION
const isTauri = IS_TAURI

const wsUrl = isProductionEnv
    ? "wss://api.sinkron.xyz"
    : `ws://${window.location.hostname}:80`

const apiUrl =
    isTauri && isProductionEnv ? "https://api.sinkron.xyz" : "/api"

const env = {
    isProductionEnv,
    wsUrl,
    apiUrl
}

export default env
