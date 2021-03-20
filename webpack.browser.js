const webpack = require('webpack');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const buildDir = path.resolve('./build');

// Create the hash
const hash = crypto.createHash('md5');
hash.update(fs.readFileSync('./package.json'));
const digest = hash.digest('hex');
fs.writeFileSync(path.resolve(buildDir, 'hash.md5'), digest);

module.exports = {
  entry:  './build/out/browser/index.js',
  target: 'electron-renderer',
  output: {
    path: buildDir,
    filename: 'browser.bundle.js'
  },
  mode: 'development',
  optimization: {
    minimize: false
  },
  module: {
    rules: [
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      { test: /\.html$/, use: 'file-loader?name=[name].[ext]' },
      { test: /\.md$/, use: 'raw-loader' },
      { test: /\.txt$/, use: 'raw-loader' },
      { test: /\.(jpg|png|gif)$/, use: 'file-loader' },
      { test: /\.js.map$/, use: 'file-loader' },
      { test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=application/font-woff' },
      { test: /\.woff(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=application/font-woff' },
      { test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=application/octet-stream' },
      { test: /\.otf(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=application/octet-stream' },
      { test: /\.eot(\?v=\d+\.\d+\.\d+)?$/, use: 'file-loader' },
      { test: /\.svg(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=image/svg+xml' }
    ],
  },
  devtool: 'source-map'
}
