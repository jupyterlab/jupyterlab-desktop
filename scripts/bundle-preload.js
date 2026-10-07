// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

// Bundles the imports in the compiled preload.js files, since import/require of
// local modules is not allowed in a sandboxed Electron preload at runtime. Each
// preload is bundled in place; electron is kept external (the runtime provides
// it). Replaces the previous webpack config.
const esbuild = require('esbuild');

const preloadPrefix = 'build/out/main';
const preloadFiles = [
  'aboutdialog/preload.js',
  'authdialog/preload.js',
  'dialog/preload.js',
  'labview/preload.js',
  'settingsdialog/preload.js',
  'progressview/preload.js',
  'pythonenvdialog/preload.js',
  'pythonenvselectpopup/preload.js',
  'remoteserverselectdialog/preload.js',
  'titlebarview/preload.js',
  'updatedialog/preload.js',
  'welcomeview/preload.js'
];

esbuild
  .build({
    entryPoints: preloadFiles.map(file => `${preloadPrefix}/${file}`),
    outdir: preloadPrefix,
    outbase: preloadPrefix,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
    allowOverwrite: true,
    logLevel: 'warning'
  })
  .catch(() => process.exit(1));
