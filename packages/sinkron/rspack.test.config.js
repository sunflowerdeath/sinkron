const path = require('path')
const nodeExternals = require('webpack-node-externals')

const isProduction = process.env.NODE_ENV === 'production'
const src = path.resolve(__dirname, 'src')

const rules = [
    {
        test: /\.js$/,
        include: [src],
        use: [{ loader: 'esbuild-loader' }]
    },
    {
        test: /\.ts$/,
        include: [src],
        use: [{ loader: 'esbuild-loader', options: { loader: 'ts' } }]
    }
]

module.exports = {
    entry: {
        test: './src/test.ts'
    },
    output: {
        path: path.resolve(__dirname, './build')
    },
    mode: isProduction ? 'production' : 'development',
    target: 'node',
    externals: [nodeExternals({ additionalModuleDirs: ['../node_modules'] })],
    resolve: {
        extensions: ['.js', '.ts']
    },
    module: { rules },
    devtool: 'cheap-module-source-map',
    optimization: {
        minimize: false
    }
}
