const path = require("path")
const nodeExternals = require("webpack-node-externals")

const isProduction = process.env.NODE_ENV === "production"
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
        use: [
            { loader: "esbuild-loader", options: { loader: "ts" } },
            { loader: "ts-loader" }
        ]
    }
]

module.exports = {
    entry: {
        main: "./src/index.ts"
    },
    output: {
        path: path.resolve(__dirname, "./build"),
        filename: "[name].js",
        library: {
            type: "commonjs"
        }
    },
    mode: isProduction ? "production" : "development",
    target: "node",
    externals: [nodeExternals({ additionalModuleDirs: ["../node_modules"] })],
    resolve: {
        extensions: [".js", ".ts"]
    },
    module: { rules },
    devtool: "cheap-module-source-map",
    optimization: {
        minimize: false
    }
}
