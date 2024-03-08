const path = require("path")
const nodeExternals = require("webpack-node-externals")

const src = path.resolve(__dirname, "src")

const rules = [
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

module.exports = {
    entry: {
        test: [
            "./src/controller/users.test.ts",
            "./src/controller/spaces.test.ts",
            "./src/controller/invites.test.ts"
        ]
    },
    output: {
        path: path.resolve(__dirname, "./build")
    },
    mode: "development",
    target: "node",
    externals: [nodeExternals({ additionalModuleDirs: ["../node_modules"] })],
    resolve: {
        extensions: [".js", ".ts"]
    },
    module: { rules },
    devtool: "cheap-module-source-map"
}
