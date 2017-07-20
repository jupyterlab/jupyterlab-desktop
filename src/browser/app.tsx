// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    PageConfig
} from '@jupyterlab/coreutils';

import {
    ElectronJupyterLab
} from './electron-extension';

import {
    JupyterServerIPC as ServerIPC,
    JupyterApplicationIPC as AppIPC
} from '../ipc';

import {
    SplashScreen, ServerManager
} from './electron-launcher';

import * as React from 'react';
import extensions from './extensions';

/**
 * Use window.require to prevent webpack
 * from trying to resolve the electron library
 */
let ipcRenderer = (window as any).require('electron').ipcRenderer;


export 
namespace Application {
    export
    interface Props {
        serverId: number;
    }

    export
    interface State {
        renderState: () => any;
    }
}

export
class Application extends React.Component<Application.Props, Application.State> {
    
    private lab: ElectronJupyterLab;

    private ignorePlugins: string[];

    constructor(props: Application.Props) {
        super(props);
        this.renderServerManager = this.renderServerManager.bind(this);
        this.renderSplash = this.renderSplash.bind(this);
        this.renderLab = this.renderLab.bind(this);
        this.serverSelected = this.serverSelected.bind(this);

        if (this.props.serverId == 1) {
            this.state = {renderState: this.renderSplash};

            let labReady = this.setupLab();
            /* Setup server data response handler */
            ipcRenderer.on(ServerIPC.Channels.SERVER_STARTED, (event: any, data: ServerIPC.Data.JupyterServer) => {
                window.addEventListener('beforeunload', () => {
                    ipcRenderer.send(ServerIPC.Channels.REQUEST_SERVER_STOP, data);
                });

                PageConfig.setOption("token", data.server.token);
                PageConfig.setOption("baseUrl", data.server.url);
                try{
                    labReady.then(() => {
                        this.lab.start({ "ignorePlugins": this.ignorePlugins});
                        (this.refs.splash as SplashScreen).fadeSplashScreen();
                    });
                }
                catch (e){
                    console.log(e);
                }
            });
            
            ipcRenderer.send(ServerIPC.Channels.REQUEST_SERVER_START, "start");
        } else {
            this.state = {renderState: this.renderServerManager}
        }

    }

    private setupLab(): Promise<void> {
        return new Promise<void>((res, rej) => {
            let version : string = PageConfig.getOption('appVersion') || 'unknown';
            let name : string = PageConfig.getOption('appName') || 'JupyterLab';
            let namespace : string = PageConfig.getOption('appNamespace') || 'jupyterlab';
            let devMode : string  = PageConfig.getOption('devMode') || 'false';
            let settingsDir : string = PageConfig.getOption('settingsDir') || '';
            let assetsDir : string = PageConfig.getOption('assetsDir') || '';

            // Get platform information from main process
            ipcRenderer.send(AppIPC.Channels.GET_PLATFORM);
            let platformSet = new Promise( (resolve, reject) => {
                ipcRenderer.on(AppIPC.Channels.SEND_PLATFORM, (event: any, args: string) => {
                    resolve(args);
                });
            });

            platformSet.then((platform) => {
                if (platform == 'win32')
                    PageConfig.setOption('terminalsAvailable', 'false');
            })

            if (version[0] === 'v') {
                version = version.slice(1);
            }

            this.lab = new ElectronJupyterLab({
                namespace: namespace,
                name: name,
                version: version,
                devMode: devMode.toLowerCase() === 'true',
                settingsDir: settingsDir,
                assetsDir: assetsDir,
                mimeExtensions: extensions.mime
            });

            try {
                this.lab.registerPluginModules(extensions.jupyterlab);
            } catch (e) {
                console.error(e);
            }
            
            // Ignore Plugins
            this.ignorePlugins = [];
            try {
                let option = PageConfig.getOption('ignorePlugins');
                this.ignorePlugins = JSON.parse(option);
            } catch (e) {
                // No-op
            }
            res();
        });
    }

    private serverSelected(server: ServerManager.Connection) {
        if (server.type == 'local') {
            this.setState({renderState: this.renderSplash});
        } else {
            PageConfig.setOption('baseUrl', server.url);
            PageConfig.setOption('token', server.token);
            try{
                this.lab.start({ "ignorePlugins": this.ignorePlugins});
            }
            catch (e){
                console.log(e);
            }
            this.setState({renderState: this.renderLab});
        }
    }

    private renderServerManager(): any {
        return <ServerManager serverSelected={this.serverSelected} />;
    }

    private renderSplash() {
        /* Request Jupyter server data from main process, then render
         * splash screen
         */
        return (
            <SplashScreen  ref='splash' finished={() => {
                this.setState({renderState: this.renderLab});}
            } />
        );
    }

    private renderLab(): any {
        return null;
    }

    render() {
        return this.state.renderState();
    }
}