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
                options: {
                    jsc: { parser: { syntax: "typescript" } }
                }
            }
        ]
    }
]

module.exports = {
    entry: {
        test: [
            "./src/tests/client.test.ts",
            "./src/tests/ws.test.ts",
            "./src/tests/collection.test.ts"
        ]
    },
    output: {
        path: path.resolve(__dirname, "./build")
    },
    mode: isProduction ? "production" : "development",
    target: "node",
    externals: [
        nodeExternals({
            additionalModuleDirs: ["../node_modules"],
            allowlist: ["nanoevents", /^lodash-es/, "query-string"]
        })
    ],
    resolve: {
        extensions: [".js", ".ts"]
    },
    module: { rules },
    devtool: "cheap-module-source-map",
    optimization: {
        minimize: false
    }
}
