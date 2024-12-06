const path = require("path")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer")

const isProduction = process.env.NODE_ENV === "production"
const isTauri = process.env.TAURI === "1"

const src = path.resolve(__dirname, "src")

const targets = "Chrome >= 91, iOS >= 15, Firefox >= 115"
const rules = [
    {
        test: /\.ts$/,
        include: [src],
        use: [
            {
                loader: "swc-loader",
                options: {
                    env: { targets, mode: "entry", coreJs: "3.38" },
                    jsc: { parser: { syntax: "typescript" } }
                }
            }
        ]
    },
    {
        test: /\.tsx$/,
        include: [src],
        use: [
            {
                loader: "swc-loader",
                options: {
                    env: { targets, mode: "entry", coreJs: "3.38" },
                    jsc: {
                        parser: { syntax: "typescript", jsx: true },
                        transform: { react: { runtime: "automatic" } }
                    }
                }
            }
        ]
    },
    {
        test: /\.svg$/i,
        issuer: /\.(js|jsx|ts|tsx)$/,
        type: "asset/source"
    },
    {
        test: /\.css$/i,
        issuer: /\.(js|jsx|ts|tsx)$/,
        type: "css"
    },
    {
        test: /\.(png|ico)/i,
        issuer: /\.(js|jsx|ts|tsx)$/,
        type: "asset/resource"
    }
]

const plugins = [
    new HtmlWebpackPlugin({
        template: "./src/index.html",
        favicon: "src/favicon.ico",
        chunks: ["main"]
    }),
    new HtmlWebpackPlugin({
        template: "./src/index.html",
        favicon: "src/favicon.ico",
        filename: "post.html",
        chunks: ["post"]
    })
]

if (process.env.ANALYZE) {
    plugins.push(new BundleAnalyzerPlugin())
}

module.exports = {
    entry: {
        main: "./src/index.tsx",
        post: "./src/post.tsx"
    },
    output: {
        clean: true,
        path: path.resolve(__dirname, "./build"),
        publicPath: isTauri ? "/" : isProduction ? "/static/" : "/",
        filename: "[name].[fullhash].js"
    },
    optimization: {
        minimize: false // isProduction
    },
    target: "web",
    resolve: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
        alias: {
            "~": src
        }
    },
    module: { rules },
    devtool: "cheap-module-source-map",
    experiments: {
        asyncWebAssembly: true,
        css: true
    },
    plugins,
    devServer: {
        host: "0.0.0.0",
        port: 1337,
        historyApiFallback: {
            rewrites: [
                { from: /^\/$/, to: "/index.html" },
                { from: /^\/posts/, to: "/post.html" }
            ]
        },
        client: {
            overlay: {
                errors: true,
                warnings: false,
                runtimeErrors: false
            }
        }
    }
}
