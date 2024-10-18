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

const rules = [
    {
        test: /\.ts$/,
        include: [src],
        use: [
            {
                loader: "builtin:swc-loader",
                options: {
                    jsc: { parser: { syntax: "typescript" } }
                }
            }
        ]
    }
]

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
    module: { rules }
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
    module: { rules }
}

module.exports = [node, browser]
