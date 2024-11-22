const path = require("path")

const isProduction = process.env.NODE_ENV === "production"
const src = path.resolve(__dirname, "src")

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

module.exports = {
    mode: isProduction ? "production" : "development",
    entry: {
        client: "./src/client.ts",
        collection: "./src/collection.ts"
    },
    output: {
        path: path.resolve(__dirname, "./lib"),
        filename: "[name].js",
        library: { type: "module" }
    },
    // target: "web",
    resolve: {
        extensions: [".js", ".ts"]
    },
    externals: ["loro-crdt", "mobx"],
    experiments: { asyncWebAssembly: true, outputModule: true },
    devtool: "cheap-module-source-map",
    optimization: { minimize: false },
    module: { rules }
}
