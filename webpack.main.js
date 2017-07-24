var webpack = require('webpack');
var path = require('path');
var fs = require('fs-extra');
var buildDir = "./build";
var package_data = require('./package.json');

// Ignore node modules
var nodeModules = {};
fs.readdirSync('node_modules')
.filter(function(x) {
    return ['.bin'].indexOf(x) === -1;
})
.forEach(function(mod) {
    nodeModules[mod] = 'commonjs ' + mod;
});



module.exports = {
  entry: './src/main/main.ts',
  target: 'node',
  output: {
    path: path.join(__dirname, 'build'),
    filename: 'main.bundle.js'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      jupyterlab_app: path.resolve(__dirname)
    }
  },
  module: {
    rules: [
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      { test: /\.json$/, use: 'json-loader' },
      { test: /\.ts$/, use: 'awesome-typescript-loader?configFileName=./src/main/tsconfig.json' },
      { test: /\.tsx$/, use: 'awesome-typescript-loader?configFileName=./src/main/tsconfig.json' },
      { test: /\.html$/, use: 'file-loader' },
      { test: /\.(jpg|png|gif)$/, use: 'file-loader' },
      { test: /\.js.map$/, use: 'file-loader' },
      { test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=application/font-woff' },
      { test: /\.woff(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=application/font-woff' },
      { test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=application/octet-stream' },
      { test: /\.eot(\?v=\d+\.\d+\.\d+)?$/, use: 'file-loader' },
      { test: /\.svg(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=image/svg+xml' }
    ],
  },
  resolveLoader: {
    modules: [
        path.join(__dirname, "node_modules")
    ]
  },
  node: {
    fs: 'empty',
    __dirname: false,
    __filename: false
  },
  bail: true,
  externals: nodeModules,
  devtool: 'sourcemap'
}