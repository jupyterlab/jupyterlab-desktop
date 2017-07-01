
import {PageConfig} from '@jupyterlab/coreutils';
import 'font-awesome/css/font-awesome.min.css';
import '@jupyterlab/theming/style/index.css';
import {ElectronJupyterLab as app} from './electron-extension';
let ipcRenderer = (window as any).require('electron').ipcRenderer;
import extensions from './extensions'

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

    // Promise for animation listener
    let promise : Promise<string>;
    document.getElementById('moon1').addEventListener('animationiteration', () => {
        promise.then( (animation) => {
            document.getElementById('universe').style.animation = animation;
        })
    });


    let lab = new app({
        namespace: namespace,
        name: name,
        version: version,
        devMode: devMode.toLowerCase() === 'true',
        settingsDir: settingsDir,
        assetsDir: assetsDir
    });

    try {
        lab.registerPluginModules(extensions);
    } catch (e) {
        console.error(e);
    }
    
    // Ignore Plugins
    let ignorePlugins : string[] = [];
    try {
        let option = PageConfig.getOption('ignorePlugins');
        ignorePlugins = JSON.parse(option);
    } catch (e) {
        // No-op
    }

    // Get token from server
    ipcRenderer.send("server-data-ready");
    ipcRenderer.on("server-data", (event: any, data: any) => {
        // Set token
        PageConfig.setOption("token", data.token);
        // Set baseUrl
        PageConfig.setOption("baseUrl", data.baseUrl);
        // Start lab and fade splash
        promise = new Promise((resolve, reject) => {
            try{
                lab.start({ "ignorePlugins": ignorePlugins });
                resolve("fade .4s linear 0s forwards");
            }
            catch (e){
                reject(e);
            }
        });
    });
}

window.onload = main;
