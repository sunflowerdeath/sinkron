const path = require("path")
const { DefinePlugin } = require("@rspack/core")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer")

const isProduction = process.env.NODE_ENV === "production"
const isTauriApp = process.env.TAURI === "1"

const src = path.resolve(__dirname, "src")

const rules = [
    {
        test: /\.(js|jsx)$/,
        include: [src],
        use: [
            {
                loader: "esbuild-loader",
                options: { loader: "jsx", jsx: "automatic" }
            }
        ]
    },
    {
        test: /\.ts$/,
        include: [src],
        use: [{ loader: "esbuild-loader", options: { loader: "ts" } }]
    },
    {
        test: /\.tsx$/,
        include: [src],
        use: [{ loader: "esbuild-loader", options: { loader: "tsx" } }]
    },
    {
        test: /\.svg$/i,
        issuer: /\.(js|jsx|ts|tsx)$/,
        type: 'asset/source'
    },
    {
        test: /\.png/i,
        issuer: /\.(js|jsx|ts|tsx)$/,
        type: 'asset/resource'
    }
]

const plugins = [
    new DefinePlugin({
        IS_PRODUCTION: isProduction,
        IS_TAURI: isTauriApp,
        // bug in rspack@1.0.0 mode=production not working
        // set mode to "none" and define manually
        "process.env.NODE_ENV": isProduction ? '"production"' : '"development"'
    }),
    new HtmlWebpackPlugin({
        template: "./src/index.html",
        favicon: "src/favicon.ico"
    })
]

if (process.env.ANALYZE) {
    plugins.push(new BundleAnalyzerPlugin())
}

module.exports = {
    entry: {
        main: "./src/index.tsx"
    },
    output: {
        clean: true,
        path: path.resolve(__dirname, "./build"),
        publicPath: isTauriApp ? "/" : isProduction ? "/static/" : "/",
        filename: "[name].[fullhash].js"
    },
    mode: "none",
    optimization: {
        // minimize: isProduction
    },
    target: "web",
    resolve: {
        extensions: [".js", ".jsx", ".ts", ".tsx"]
    },
    module: { rules },
    devtool: "cheap-module-source-map",
    experiments: { asyncWebAssembly: true },
    plugins,
    devServer: {
        host: "0.0.0.0",
        port: 1337,
        historyApiFallback: true,
        proxy: [
            {
                context: "/api",
                target: "http://localhost:80",
                pathRewrite: { "^/api": "" }
            }
        ]
    }
}
