const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

const isProduction = process.env.NODE_ENV === 'production'
const src = path.resolve(__dirname, 'src')

const rules = [
    {
        test: /\.(js|jsx)$/,
        include: [src],
        use: [
            {
                loader: 'esbuild-loader',
                options: { loader: 'jsx', jsx: 'automatic' }
            }
        ]
    },
    {
        test: /\.(ts|tsx)$/,
        include: [src],
        use: [
            {
                loader: 'esbuild-loader',
                options: { loader: 'tsx', jsx: 'automatic' }
            }
        ]
    }
]

module.exports = {
    experiments: { asyncWebAssembly: true },
    target: 'web',
    entry: {
        main: './src/front/index.tsx'
    },
    output: {
        path: path.resolve(__dirname, './build'),
        publicPath: '/'
    },
    mode: isProduction ? 'production' : 'development',
    resolve: {
        // mainFields: ["main", "module"],
        extensions: ['.js', '.ts', '.jsx', '.tsx']
    },
    module: { rules },
    devtool: 'cheap-module-source-map',
    optimization: {
        minimize: false
    },
    plugins: [new HtmlWebpackPlugin({ template: './src/front/index.html' })],
    devServer: {
        host: '0.0.0.0',
        port: 1337,
        historyApiFallback: true,
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                pathRewrite: { '^/api': '' }
            }
        }
    }
}
