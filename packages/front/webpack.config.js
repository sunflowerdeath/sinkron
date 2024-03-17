const path = require("path")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer")
const { EsbuildPlugin } = require("esbuild-loader")

const isProduction = process.env.NODE_ENV === "production"
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
        use: ["raw-loader"]
    },
    {
        test: /\.png/i,
        issuer: /\.(js|jsx|ts|tsx)$/,
        use: ["file-loader"]
    }
]

const plugins = [
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
        path: path.resolve(__dirname, "./build"),
        publicPath: isProduction ? "/static/" : "/",
        filename: "[name].[hash].js"
    },
    mode: isProduction ? "production" : "development",
    optimization: {
        minimizer: [new EsbuildPlugin({ target: "es2015" })],
        minimize: false
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
        proxy: {
            "/api": {
                target: "http://localhost:80",
                pathRewrite: { "^/api": "" }
            }
        }
    }
}
