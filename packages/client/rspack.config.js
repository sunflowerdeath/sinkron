const path = require("path")

const isProduction = process.env.NODE_ENV === "production"
const src = path.resolve(__dirname, "src")

const base = {
    mode: isProduction ? "production" : "development",
    resolve: {
        extensions: [".js", ".ts"]
    },
    externals: ["@automerge/automerge", "mobx"],
    experiments: { asyncWebAssembly: true, outputModule: true },
    devtool: "cheap-module-source-map",
    optimization: { minimize: false }
}

const node = {
    ...base,
    entry: {
        main: "./src/index.ts"
    },
    output: {
        path: path.resolve(__dirname, "./build"),
        filename: "main.js",
        library: { type: "commonjs" }
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                include: [src],
                use: [{ loader: "esbuild-loader" }]
            },
            {
                test: /\.ts$/,
                include: [src],
                use: [{ loader: "esbuild-loader", options: { loader: "ts" } }]
            }
        ]
    }
    // target: "node"
}

const browser = {
    ...base,
    entry: {
        main: "./src/index.ts"
    },
    output: {
        path: path.resolve(__dirname, "./build"),
        filename: "main.browser.js",
        library: { type: "module" }
    },
    target: "web",
    module: {
        rules: [
            {
                test: /\.js$/,
                include: [src],
                use: [{ loader: "esbuild-loader" }]
            },
            {
                test: /\.ts$/,
                include: [src],
                use: [
                    { loader: "esbuild-loader", options: { loader: "ts" } },
                    { loader: "ts-loader" }
                ]
            }
        ]
    }
}

module.exports = [node, browser]
