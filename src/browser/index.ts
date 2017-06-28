
import {PageConfig} from '@jupyterlab/coreutils';
import {RenderMime} from '@jupyterlab/rendermime';
import 'font-awesome/css/font-awesome.min.css';
import '@jupyterlab/theming/style/index.css';
import {JupyterLab as app} from '@jupyterlab/application';
let ipcRenderer = (window as any).require('electron').ipcRenderer;

let extensions = [
    require("./electron-extension/index.js"),
    require("@jupyterlab/apputils-extension"),
    require("@jupyterlab/chatbox-extension"),
    require("@jupyterlab/codemirror-extension"),
    require("@jupyterlab/completer-extension"),
    require("@jupyterlab/console-extension"),
    require("@jupyterlab/csvviewer-extension"),
    require("@jupyterlab/docmanager-extension"),
    require("@jupyterlab/docregistry-extension"),
    require("@jupyterlab/fileeditor-extension"),
    require("@jupyterlab/faq-extension"),
    require("@jupyterlab/filebrowser-extension"),
    require("@jupyterlab/help-extension"),
    require("@jupyterlab/imageviewer-extension"),
    require("@jupyterlab/inspector-extension"),
    require("@jupyterlab/launcher-extension"),
    require("@jupyterlab/markdownviewer-extension"),
    require("@jupyterlab/notebook-extension"),
    require("@jupyterlab/rendermime-extension"),
    require("@jupyterlab/running-extension"),
    require("@jupyterlab/services-extension"),
    require("@jupyterlab/settingeditor-extension"),
    require("@jupyterlab/shortcuts-extension"),
    require("@jupyterlab/tabmanager-extension"),
    require("@jupyterlab/terminal-extension"),
    require("@jupyterlab/theme-light-extension"),
    require("@jupyterlab/tooltip-extension")
];

let mimeExtensions: any[] = [
    require("@jupyterlab/vega")
];


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

    try {
        lab.registerPluginModules(extensions);
    } catch (e) {
        console.error(e);
    }

    for (let exten in mimeExtensions) {
        try {
            RenderMime.registerExtensionModule(exten as any);
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

    ipcRenderer.send("ready-for-token");
    ipcRenderer.on("token", (event: any, arg: any) => {
        PageConfig.setOption("token", arg);
        lab.start({ "ignorePlugins": ignorePlugins });
        // document.getElementById("universe").style.animation = "fade .4s linear 0s forwards";
    });

}

window.onload = main;
