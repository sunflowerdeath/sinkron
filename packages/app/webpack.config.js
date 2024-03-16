const glob = require("glob")
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
        use: [{ loader: "esbuild-loader", options: { loader: "ts" } }]
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
        db: "./src/db.ts"
    },
    output: {
        path: path.resolve(__dirname, "./build"),
        filename: "[name].js",
        library: {
            type: "commonjs"
        }
    }
}

const migrations = glob.sync("./src/migrations/*.ts")
const migrationsEntry = {}
migrations.forEach((file) => {
    migrationsEntry[path.basename(file, ".ts")] = file
})
const migrationsConfig = {
    ...baseConfig,
    entry: migrationsEntry,
    output: {
        path: path.resolve(__dirname, "./build/migrations"),
        clean: true,
        filename: "[name].js",
        library: {
            type: "commonjs"
        }
    },
    devtool: false
}

module.exports = [appConfig, dbConfig, migrationsConfig]
