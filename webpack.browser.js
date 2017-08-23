var webpack = require('webpack');
var path = require('path');
var fs = require('fs-extra');
var crypto = require('crypto');
var package_data = require('./package.json');
const ExtractTextPlugin = require("extract-text-webpack-plugin");
var buildDir = './build';

// Create the hash
var hash = crypto.createHash('md5');
hash.update(fs.readFileSync('./package.json'));
var digest = hash.digest('hex');
fs.writeFileSync(path.resolve(buildDir, 'hash.md5'), digest);

module.exports = {
  entry:  './build/out/browser/index.js',
  output: {
    path: path.resolve(buildDir),
    filename: 'browser.bundle.js',
    libraryTarget: 'commonjs'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      'jupyterlab_app/src': path.join(path.resolve(__dirname), 'build', 'out')
    }
  },
  externals: [
    function(context, request, callback) {
      if (/^@jupyterlab/g.test(request)){
        return callback();
      } else if (/^\.\/build\/out\/browser/g.test(request)){
        return callback();
      } else if (/^\jupyterlab_app\/src\/browser/g.test(request)){
        return callback();
      }

      callback(null, 'commonjs ' + request);
    }
  ],
  module: {
    rules: [
      { test: /\.css$/, 
        use: ExtractTextPlugin.extract({ 
          use: 'css-loader', 
          fallback: 'style-loader' 
        }
      )},
      { test: /\.json$/, use: 'json-loader' },
      { test: /\.html$/, use: 'file-loader?name=[name].[ext]' },
      { test: /\.(jpg|png|gif)$/, use: 'file-loader' },
      { test: /\.js.map$/, use: 'file-loader' },
      { test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=application/font-woff' },
      { test: /\.woff(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=application/font-woff' },
      { test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=application/octet-stream' },
      { test: /\.eot(\?v=\d+\.\d+\.\d+)?$/, use: 'file-loader' },
      { test: /\.svg(\?v=\d+\.\d+\.\d+)?$/, use: 'url-loader?limit=10000&mimetype=image/svg+xml' }
    ],
  },
  externals: {
    module: 'commonjs module'
  },
  node: {
    fs: 'empty',
    __dirname: false,
    __filename: false
  },
  plugins: [
    new ExtractTextPlugin("styles.css"),
  ],
  bail: true,
  devtool: 'cheap-source-map'
}
