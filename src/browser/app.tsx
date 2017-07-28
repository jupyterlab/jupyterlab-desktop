// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JSONObject
} from '@phosphor/coreutils';

import {
    PageConfig
} from '@jupyterlab/coreutils';

import {
    StateDB
} from '@jupyterlab/coreutils';

import {
    JupyterServerIPC as ServerIPC,
    JupyterWindowIPC as WindowIPC
} from 'jupyterlab_app/src/ipc';

import {
    SplashScreen, ServerManager, TitleBar
} from 'jupyterlab_app/src/browser/components';

import {
    ElectronJupyterLab
} from 'jupyterlab_app/src/browser/extensions/electron-extension';

import * as React from 'react';
import extensions from 'jupyterlab_app/src/browser/extensions';

/**
 * Use window.require to prevent webpack
 * from trying to resolve the electron library
 */
let ipcRenderer = (window as any).require('electron').ipcRenderer;


export
class Application extends React.Component<Application.Props, Application.State> {
    
    private lab: ElectronJupyterLab;

    private ignorePlugins: string[];

    private server: ServerIPC.ServerDesc = null;

    private nextRemoteId: number = 1;
    
    private serverState: StateDB;

    private labReady: Promise<void>;

    constructor(props: Application.Props) {
        super(props);
        this.renderServerManager = this.renderServerManager.bind(this);
        this.renderSplash = this.renderSplash.bind(this);
        this.renderLab = this.renderLab.bind(this);
        this.serverSelected = this.serverSelected.bind(this);
        this.connectionAdded = this.connectionAdded.bind(this);

        this.labReady = this.setupLab();
        
        /* Setup server data response handler */
        ipcRenderer.on(ServerIPC.RESPOND_SERVER_STARTED, (event: any, data: ServerIPC.ServerStarted) => {
            if (data.err) {
                console.log('Error starting local server, show error screen');
                return;
            }
            
            window.addEventListener('beforeunload', () => {
                ipcRenderer.send(ServerIPC.REQUEST_SERVER_STOP, data.factoryId);
            });
            
            this.server = data.server;
            PageConfig.setOption("token", this.server.token);
            PageConfig.setOption("baseUrl", this.server.url);
            
            this.labReady.then(() => {
                try {
                    this.lab.start({"ignorePlugins": this.ignorePlugins});
                } catch(e) {
                    console.log(e);
                }
                (this.refs.splash as SplashScreen).fadeSplashScreen();
            });
        });

        if (this.props.options.state == 'local') {
            this.state = {renderState: this.renderSplash, remotes: {servers: []}};
            ipcRenderer.send(ServerIPC.REQUEST_SERVER_START);
        } else {
            this.state = {renderState: this.renderServerManager, remotes: {servers: []}};
        }
        
        this.serverState = new StateDB({namespace: Application.STATE_NAMESPACE});
        this.serverState.fetch(Application.SERVER_STATE_ID)
            .then((data: Application.Connections | null) => {
                if (!data)
                    return;
                // Find max connection ID
                let maxID = 0;
                for (let val of data.servers)
                    maxID = Math.max(maxID, val.id);
                this.nextRemoteId = maxID + 1;
                // Render UI with saved servers
                this.setState({remotes: data});
            })
            .catch((e) => {
                console.log(e);
            });
    }

    private saveState() {
        this.serverState.save(Application.SERVER_STATE_ID, this.state.remotes);
    }

    private setupLab(): Promise<void> {
        return new Promise<void>((res, rej) => {
            let version : string = PageConfig.getOption('appVersion') || 'unknown';
            let name : string = PageConfig.getOption('appName') || 'JupyterLab';
            let namespace : string = PageConfig.getOption('appNamespace') || 'jupyterlab';
            let devMode : string  = PageConfig.getOption('devMode') || 'false';
            let settingsDir : string = PageConfig.getOption('settingsDir') || '';
            let assetsDir : string = PageConfig.getOption('assetsDir') || '';

            if (this.props.options.platform == 'win32')
                PageConfig.setOption('terminalsAvailable', 'false');

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
                mimeExtensions: extensions.mime,
                platform: this.props.options.platform,
                uiState: this.props.options.uiState
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

    private connectionAdded(server: ServerIPC.ServerDesc) {
        PageConfig.setOption('baseUrl', server.url);
        PageConfig.setOption('token', server.token);
        
        this.labReady.then(() => {
            try {
                this.lab.start({"ignorePlugins": this.ignorePlugins});
            } catch(e) {
                console.log(e);
            }
        });

        this.setState((prev: ServerManager.State) => {
            server.id = this.nextRemoteId++;
            let conns = this.state.remotes.servers.concat(server);
            return({
                renderState: this.renderLab,
                conns: {servers: conns}
            });
        });
    }

    private serverSelected(server: ServerIPC.ServerDesc) {
        console.log('This function will be deprecated');
    }

    private renderServerManager(): any {
        // Always insert Local server card
        let servers: ServerIPC.ServerDesc[] = [{id: this.nextRemoteId++, name: 'Local', type: 'local'}];
        servers.concat(this.state.remotes.servers);

        return (
            <div className='jpe-content'>
                <TitleBar uiState={this.props.options.uiState} />
                <ServerManager servers={servers} 
                              serverSelected={this.serverSelected}
                              serverAdded={this.connectionAdded} />;
            </div>
        );
    }

    private renderSplash() {
        return (
            <div className='jpe-content'>
                <SplashScreen  ref='splash' uiState={this.props.options.uiState} finished={() => {
                    this.setState({renderState: this.renderLab});}
                } />
            </div>
        );
    }

    private renderLab(): any {
        this.saveState();

        return null;
    }

    render() {
        let content = this.state.renderState();

        return (
            <div className='jpe-body'>
                {content}
            </div>
        );
    }
}

export 
namespace Application {
    
    /**
     * Namspace for server manager state stored in StateDB
     */
    export
    const STATE_NAMESPACE =  'JupyterApplication-state';

    /**
     * ID for ServerManager server data in StateDB
     */
    export
    const SERVER_STATE_ID = 'servers';

    export
    interface Props {
        options: WindowIPC.WindowOptions;
    }

    export
    interface State {
        renderState: () => any;
        remotes: Connections;
    }
    
    export
    interface Connections extends JSONObject {
        servers: ServerIPC.ServerDesc[];
    }

}
