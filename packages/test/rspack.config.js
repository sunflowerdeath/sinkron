const path = require("path")
const nodeExternals = require("webpack-node-externals")

const src = path.resolve(__dirname, "src")

const rules = [
    {
        test: /\.ts$/,
        include: [src],
        use: [
            {
                loader: "builtin:swc-loader",
                options: {
                    // env: { mode: "entry", coreJs: "3.38" },
                    jsc: { parser: { syntax: "typescript" } }
                }
            }
        ]
    }
]

module.exports = {
    entry: {
        main: "./src/lorotest.ts"
    },
    output: {
        clean: true,
        path: path.resolve(__dirname, "./build"),
        filename: "[name].js"
    },
    mode: "none", //isProduction ? "production" : "development",
    target: "node",
    externals: [nodeExternals({ 
        additionalModuleDirs: ["../node_modules"],
        allowlist: ["nanoevents"]
    })],
    optimization: {
        minimize: false
    },
    resolve: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
        alias: {
            "~": src
        }
    },
    module: { rules },
    devtool: "cheap-module-source-map",
    experiments: { asyncWebAssembly: true }
}
