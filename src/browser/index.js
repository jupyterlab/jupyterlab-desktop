require('es6-promise/auto');  // polyfill Promise on IE

var PageConfig = require('@jupyterlab/coreutils').PageConfig;
__webpack_public_path__ = PageConfig.getOption('publicUrl');

// This needs to come after __webpack_public_path__ is set.
require('font-awesome/css/font-awesome.min.css');
// Load the core theming before any other package.
require('@jupyterlab/default-theme/style/index.css');

// Use window.require to prevent webpack from expanding electron
var ipcRenderer = window.require('electron').ipcRenderer;
var app = require('@jupyterlab/application').JupyterLab;

function main() {
    var version = PageConfig.getOption('appVersion') || 'unknown';
    var name = PageConfig.getOption('appName') || 'JupyterLab';
    var namespace = PageConfig.getOption('appNamespace') || 'jupyterlab';
    var devMode = PageConfig.getOption('devMode') || 'false';
    var settingsDir = PageConfig.getOption('settingsDir') || '';
    var assetsDir = PageConfig.getOption('assetsDir') || '';

    if (version[0] === 'v') {
        version = version.slice(1);
    }

    lab = new app({
        namespace: namespace,
        name: name,
        version: version,
        devMode: devMode.toLowerCase() === 'true',
        settingsDir: settingsDir,
        assetsDir: assetsDir
    });
    {{#each jupyterlab_extensions}}
    try {
        lab.registerPluginModule(require('{{this}}'));
    } catch (e) {
        console.error(e);
    }
    {{/each}}
    var ignorePlugins = [];
    try {
        var option = PageConfig.getOption('ignorePlugins');
        ignorePlugins = JSON.parse(option);
    } catch (e) {
        // No-op
    }
    lab.start({ "ignorePlugins": ignorePlugins });
    ipcRenderer.on('server-data', (evt, arg) => {
        /*var serverData = JSON.parse(String(arg));
        var el = document.getElementById('jupyter-config-data');
        var data = JSON.parse(el.innerText);
        data.token = serverData.token;
        el.innerText = JSON.stringify(data);
        console.log(JSON.parse(el.innerText));*/
        //lab.start({ "ignorePlugins": ignorePlugins });
    });

    ipcRenderer.send('server-data', 'get');
}

window.onload = main;
