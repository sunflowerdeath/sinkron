import path from 'node:path';
import { defineConfig } from "@rspack/cli"
import { rspack } from "@rspack/core"

// const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer")

const isProduction = process.env.NODE_ENV === "production"
const isTauri = process.env.TAURI === "1"

const src = path.resolve(__dirname, "src")

const targets = "Chrome >= 91, iOS >= 15, Firefox >= 115, Safari >= 15"
const rules = [
    {
        test: /\.ts$/,
        include: [src],
        use: [
            {
                loader: "builtin:swc-loader",
                options: {
                    env: { targets, mode: "entry", coreJs: "3.38" },
                    jsc: { parser: { syntax: "typescript" } },
                },
            },
        ],
    },
    {
        test: /\.tsx$/,
        include: [src],
        use: [
            {
                loader: "builtin:swc-loader",
                options: {
                    env: { targets, mode: "entry", coreJs: "3.38" },
                    jsc: {
                        parser: { syntax: "typescript", jsx: true },
                    },
                },
            },
        ],
    },
    {
        test: /\.svg$/i,
        issuer: /\.(js|jsx|ts|tsx)$/,
        type: "asset/source",
    },
    {
        test: /\.(png|ico)$/i,
        issuer: /\.(js|jsx|ts|tsx)$/,
        type: "asset",
    },
    {
        test: /\.css$/i,
        type: "css",
    },
]

const plugins = [
    new rspack.HtmlRspackPlugin({
        template: "./src/index.html",
        favicon: "src/favicon.ico",
        chunks: ["main"],
    }),
]

// if (process.env.ANALYZE) {
// plugins.push(new BundleAnalyzerPlugin())
// }

export default defineConfig({
    entry: {
        main: "./src/index.tsx",
    },
    output: {
        clean: true,
        path: path.resolve(__dirname, "./build"),
        publicPath: isTauri ? "/" : isProduction ? "/static/" : "/",
        filename: "[name].[fullhash].js",
    },
    optimization: {
        minimize: false, // isProduction
    },
    target: "web",
    resolve: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
        alias: {
            "~": src,
        },
    },
    module: { rules },
    devtool: false, // "cheap-module-source-map",
    experiments: {
        asyncWebAssembly: true,
        css: true,
    },
    plugins,
    devServer: {
        host: "0.0.0.0",
        port: 1337,
        historyApiFallback: {
            rewrites: [
                { from: /^\/$/, to: "/index.html" },
                { from: /^\/posts/, to: "/post.html" },
            ],
        },
        client: {
            overlay: {
                errors: true,
                warnings: false,
                runtimeErrors: false,
            },
        },
    },
})
