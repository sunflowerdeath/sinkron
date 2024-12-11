const path = require("path")
const nodeExternals = require("webpack-node-externals")

const isProduction = process.env.NODE_ENV === "production"
const dir = __dirname
const src = path.resolve(dir, "src")
const build = path.resolve(dir, "build")

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
    output: {
        path: build,
        filename: "[name].js",
        library: { type: "commonjs" }
    },
    mode: isProduction ? "production" : "development",
    target: "node",
    externals: [
        nodeExternals({
            additionalModuleDirs: ["../node_modules"]
        })
    ],
    resolve: {
        extensions: [".js", ".ts"]
    },
    module: { rules },
    devtool: "cheap-module-source-map",
    experiments: { asyncWebAssembly: true },
    optimization: {
        minimize: false
    }
}

const config = {
    ...baseConfig,
    entry: {
        main: "./src/index.ts",
        db: "./src/db.ts",
        test: [
            "./src/tests/users.test.ts",
            "./src/tests/spaces.test.ts",
            "./src/tests/invites.test.ts",
            "./src/tests/posts.test.ts"
        ]
    }
}

module.exports = config
