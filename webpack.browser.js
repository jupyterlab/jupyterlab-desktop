const webpack = require('webpack');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const buildDir = path.resolve('./build');
const { ModuleFederationPlugin } = webpack.container;

const data = require('./package.json');

// Create the hash
const hash = crypto.createHash('md5');
hash.update(fs.readFileSync('./package.json'));
const digest = hash.digest('hex');
fs.writeFileSync(path.resolve(buildDir, 'hash.md5'), digest);

// Based on:
// - https://github.com/jupyterlab/jupyterlab/blob/master/examples/federated/core_package/webpack.config.js
// - https://github.com/jupyterlab/jupyterlab/blob/master/builder/src/extensionConfig.ts
// - https://github.com/jupyterlab/retrolab/blob/main/app/webpack.config.js

/**
 * Create the webpack ``shared`` configuration
 */
function createShared(packageData) {
  // Set up module federation sharing config
  const shared = {};
  const extensionPackages = packageData.jupyterlab.extensions;

  // Make sure any resolutions are shared
  for (let [pkg, requiredVersion] of Object.entries(packageData.resolutions)) {
    // Allow extensions to match a wider range than the core dependency
    // To ensure forward compatibility.
    shared[pkg] = { requiredVersion: requiredVersion.replace('~', '^') };
  }

  // Add any extension packages that are not in resolutions (i.e., installed from npm)
  for (let pkg of extensionPackages) {
    if (!shared[pkg]) {
      shared[pkg] = {
        requiredVersion: require(`${pkg}/package.json`).version
      };
    }
  }

  // Add dependencies and sharedPackage config from extension packages if they
  // are not already in the shared config. This means that if there is a
  // conflict, the resolutions package version is the one that is shared.
  const extraShared = [];
  for (let pkg of extensionPackages) {
    let pkgShared = {};
    let {
      dependencies = {},
      jupyterlab: { sharedPackages = {} } = {}
    } = require(`${pkg}/package.json`);
    for (let [dep, requiredVersion] of Object.entries(dependencies)) {
      if (!shared[dep]) {
        pkgShared[dep] = { requiredVersion };
      }
    }

    // Overwrite automatic dependency sharing with custom sharing config
    for (let [dep, config] of Object.entries(sharedPackages)) {
      if (config === false) {
        delete pkgShared[dep];
      } else {
        if ('bundled' in config) {
          config.import = config.bundled;
          delete config.bundled;
        }
        pkgShared[dep] = config;
      }
    }
    extraShared.push(pkgShared);
  }

  // Now merge the extra shared config
  const mergedShare = {};
  for (let sharedConfig of extraShared) {
    for (let [pkg, config] of Object.entries(sharedConfig)) {
      // Do not override the basic share config from resolutions
      if (shared[pkg]) {
        continue;
      }

      // Add if we haven't seen the config before
      if (!mergedShare[pkg]) {
        mergedShare[pkg] = config;
        continue;
      }

      // Choose between the existing config and this new config. We do not try
      // to merge configs, which may yield a config no one wants
      let oldConfig = mergedShare[pkg];

      // if the old one has import: false, use the new one
      if (oldConfig.import === false) {
        mergedShare[pkg] = config;
      }
    }
  }

  Object.assign(shared, mergedShare);

  // Transform any file:// requiredVersion to the version number from the
  // imported package. This assumes (for simplicity) that the version we get
  // importing was installed from the file.
  for (let [pkg, { requiredVersion }] of Object.entries(shared)) {
    if (requiredVersion && requiredVersion.startsWith('file:')) {
      shared[pkg].requiredVersion = require(`${pkg}/package.json`).version;
    }
  }

  // Set all shipped packages as eager (this is suboptimal, but works for now)
  for (let [pkg] of Object.entries(shared)) {
    shared[pkg].eager = true;
  }

  // Add singleton package information
  for (let pkg of packageData.jupyterlab.singletonPackages) {
    if (shared[pkg]) {
      shared[pkg].singleton = true;
    }
  }

  return shared;
}

module.exports = {
  entry:  './build/out/browser/index.js',
  target: 'electron-renderer',
  output: {
    path: buildDir,
    library: {
      type: 'var',
      name: ['_JUPYTERLAB', 'CORE_OUTPUT']
    },
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
  plugins: [
    new ModuleFederationPlugin({
      library: {
        type: 'var',
        name: ['_JUPYTERLAB', 'CORE_LIBRARY_FEDERATION']
      },
      name: 'CORE_FEDERATION',
      shared: createShared(data)
    })
  ],
  devtool: 'source-map'
};
