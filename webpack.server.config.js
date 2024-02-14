const path = require("path")
const nodeExternals = require("webpack-node-externals")

const isProduction = process.env.NODE_ENV === "production"
const src = path.resolve(__dirname, "src")

const rules = [
    {
        test: /\.js$/,
        include: [src],
        use: [{ loader: "esbuild-loader" }],
    },
    {
        test: /\.ts$/,
        include: [src],
        use: [{ loader: "esbuild-loader", options: { loader: "ts" } }],
    },
]

module.exports = {
    entry: {
        server: "./src/server.ts",
        test: [
            "./src/sinkron/server.test.ts",
            "./src/slate/slate.test.ts",
            "./src/paper/controller/users.test.ts",
        ]
    },
    output: {
        path: path.resolve(__dirname, "./build"),
    },
    mode: isProduction ? "production" : "development",
    target: "node",
    externals: [nodeExternals({ additionalModuleDirs: ["../node_modules"] })],
    resolve: {
        mainFields: ['main', 'module'],
        extensions: [".js", ".ts"],
    },
    module: { rules },
    devtool: "cheap-module-source-map",
    optimization: {
        minimize: false,
    },
}
