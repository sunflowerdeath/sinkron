const isProductionEnv = window.location.hostname.includes("sinkron.xyz")

const wsUrl = isProductionEnv
    ? "wss://api.sinkron.xyz"
    : `ws://${window.location.hostname}:80`

const apiUrl = "/api"
// isProductionEnv
    // ? "https://api.sinkron.xyz"
    // : "http://localhost:80"

const env = {
    isProductionEnv,
    wsUrl,
    apiUrl
}

export default env
