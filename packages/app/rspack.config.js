const path = require("path")
const nodeExternals = require("webpack-node-externals")

const isProduction = process.env.NODE_ENV === "production"
const src = path.resolve(__dirname, "src")

const rules = [
    {
        test: /\.ts$/,
        include: [src],
        use: [
            {
                loader: "builtin:swc-loader",
                options: { jsc: { parser: { syntax: "typescript" } } }
            }
        ]
    }
]

const baseConfig = {
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

const appConfig = {
    ...baseConfig,
    entry: {
        main: "./src/index.ts"
    },
    output: {
        path: path.resolve(__dirname, "./build"),
        filename: "[name].js"
    }
}

const dbConfig = {
    ...baseConfig,
    entry: {
        db: "./src/db/app.ts"
    },
    output: {
        path: path.resolve(__dirname, "./build"),
        filename: "[name].js",
        library: { type: "commonjs" }
    }
}

module.exports = [appConfig, dbConfig]
