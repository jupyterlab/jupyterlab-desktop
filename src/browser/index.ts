import {JupyterLab as app} from '@jupyterlab/application';
import {PageConfig} from '@jupyterlab/coreutils';
import JupyterLab from './extensions';
import 'font-awesome/css/font-awesome.min.css';
import '@jupyterlab/default-theme/style/index.css';
__webpack_public_path__ = PageConfig.getOption('publicUrl');

function main() : void {
    let version : string = PageConfig.getOption('appVersion') || 'unknown';
    let name : string = PageConfig.getOption('appName') || 'JupyterLab';
    let namespace : string = PageConfig.getOption('appNamespace') || 'jupyterlab';
    let devMode : string  = PageConfig.getOption('devMode') || 'false';
    let settingsDir : string = PageConfig.getOption('settingsDir') || '';
    let assetsDir : string = PageConfig.getOption('assetsDir') || '';
    if (version[0] === 'v') {
        version = version.slice(1);
    }
    let lab = new app({
        namespace: namespace,
        name: name,
        version: version,
        devMode: devMode.toLowerCase() === 'true',
        settingsDir: settingsDir,
        assetsDir: assetsDir
    });

    // Require Extensions 
    for (let ext of JupyterLab.extensions){
        try {
            lab.registerPluginModule(ext);
        } catch (e) {
            console.error(e);
        }
    }
    
    // Ignore Plugins
    let ignorePlugins : string[] = [];
    try {
        let option = PageConfig.getOption('ignorePlugins');
        ignorePlugins = JSON.parse(option);
    } catch (e) {
        // No-op
    }

    lab.start({ "ignorePlugins": ignorePlugins });
}
window.onload = main;
