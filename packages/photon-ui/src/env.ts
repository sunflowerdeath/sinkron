const domain = "photon.app"

type Urls = {
    front: string
    sinkron: string
    api: string
}

const devUrls: Urls = {
    front: location.origin,
    sinkron: `ws://${window.location.hostname}:3333`,
    api: `http://${window.location.hostname}:80`,
}

// Url of the host machine when accessing inside the tauri app
const tauriHost = "10.0.2.2"

const tauriUrls: Urls = {
    front: location.origin,
    sinkron: `ws://${tauriHost}:3333/sync`,
    api: `http://${tauriHost}:80`,
}

const prodUrls: Urls = {
    front: `https://${domain}`,
    sinkron: `wss://sinkron.${domain}`,
    api: `https://api.${domain}`,
}

const isProductionEnv = process.env.NODE_ENV === "production"
const isTauri = window.location.hostname === "tauri.localhost"
const urls = isProductionEnv ? prodUrls : isTauri ? tauriUrls : devUrls

const env = {
    isProductionEnv,
    isTauri,
    urls,
}

export { env }
