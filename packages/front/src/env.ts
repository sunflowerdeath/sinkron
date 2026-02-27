const DOMAIN = "sinkron.space"

const prodUrls = {
    front: `https://${DOMAIN}`,
    sync: `wss://sync.${DOMAIN}/sync`,
    api: `https://app.${DOMAIN}`,
}

const devUrls = {
    front: location.origin,
    sync: "ws://${window.location.hostname}:3333/sync",
    api: "http://${window.location.hostname}:80"
}

const tauriUrls = {
    front: location.origin,
    sync: "ws://10.0.2.2:3333/sync",
    api: "http://10.0.2.2:80"
}

const isProductionEnv = process.env.NODE_ENV === "production"
const isTauri = window.location.hostname === "tauri.localhost"
const urls = isProductionEnv ? prodUrls : isTauri ? tauriUrls : devUrls

const env = { isProductionEnv, isTauri, urls }

export default env

