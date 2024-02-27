const path = require("path")
const HtmlWebpackPlugin = require("html-webpack-plugin")

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
        test: /\.(ts|tsx)$/,
        include: [src],
        use: [
            {
                loader: "esbuild-loader",
                options: { loader: "tsx", jsx: "automatic" }
            }
        ]
    },
    {
        test: /\.svg$/i,
        issuer: /\.(js|jsx|ts|tsx)$/,
        use: ["raw-loader"]
    }
]

module.exports = {
    entry: {
        main: "./src/index.tsx"
    },
    output: {
        path: path.resolve(__dirname, "./build")
    },
    mode: isProduction ? "production" : "development",
    target: "web",
    resolve: {
        extensions: [".js", ".jsx", ".ts", ".tsx"]
    },
    module: { rules },
    devtool: "cheap-module-source-map",
    optimization: {
        minimize: false
    },
    experiments: { asyncWebAssembly: true },
    plugins: [new HtmlWebpackPlugin({ template: "./src/index.html" })],
    devServer: {
        host: "0.0.0.0",
        port: 1337,
        historyApiFallback: true,
        proxy: {
            "/api": {
                target: "http://localhost:8080",
                pathRewrite: { "^/api": "" }
            }
        }
    }
}
