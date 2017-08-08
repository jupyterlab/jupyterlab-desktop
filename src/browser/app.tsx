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
} from 'jupyterlab_app/src/ipc';

import {
    SplashScreen, ServerManager, TitleBar, ServerError
} from 'jupyterlab_app/src/browser/components';

import {
    ElectronJupyterLab
} from 'jupyterlab_app/src/browser/extensions/electron-extension';

import {
    JupyterServer, ipcRenderer
} from 'jupyterlab_app/src/browser/utils';

import {
    JupyterLabWindow
} from 'jupyterlab_app/src/main/window';

import * as React from 'react';
import extensions from 'jupyterlab_app/src/browser/extensions';


export
class Application extends React.Component<Application.Props, Application.State> {

    constructor(props: Application.Props) {
        super(props);
        this._renderServerManager = this._renderServerManager.bind(this);
        this._renderSplash = this._renderSplash.bind(this);
        this._renderLab = this._renderLab.bind(this);
        this._renderErrorScreen = this._renderErrorScreen.bind(this);
        this._connectionAdded = this._connectionAdded.bind(this);
        this._launchFromPath = this._launchFromPath.bind(this);

        this._labReady = this._setupLab();
        
        ipcRenderer.on(ServerIPC.RESPOND_SERVER_STARTED, (event: any, data: ServerIPC.IServerStarted) => {
            if (data.err) {
                console.error(data.err);
                this.setState({renderState: this._renderErrorScreen});
                return;
            }
            
            window.addEventListener('beforeunload', () => {
                let stopMessage: ServerIPC.IRequestServerStop = {factoryId: data.factoryId}; 
                ipcRenderer.send(ServerIPC.REQUEST_SERVER_STOP, stopMessage);
            });
            
            this._server = {
                token: data.token,
                url: data.url,
                name: 'Local',
                type: 'local',
            };

            PageConfig.setOption("token", this._server.token);
            PageConfig.setOption("baseUrl", this._server.url);
            
            this._labReady.then(() => {
                try {
                    this._lab.start({"ignorePlugins": this._ignorePlugins});
                } catch(e) {
                    console.log(e);
                }
                this._lab.restored.then( () => {
                    (this.refs.splash as SplashScreen).fadeSplashScreen();
                });
            });
        });

        if (this.props.options.serverState == 'local') {
            this.state = {renderState: this._renderSplash, remotes: []};
            ipcRenderer.send(ServerIPC.REQUEST_SERVER_START);
        } else {
            this.state = {renderState: this._renderServerManager, remotes: []};
        }
        
        this._serverState = new StateDB({namespace: Application.STATE_NAMESPACE});
        this._serverState.fetch(Application.SERVER_STATE_ID)
            .then((data: Application.IRemoteServerState | null) => {
                if (!data || !data.remotes)
                    return;
                // Find max connection ID
                let maxID = 0;
                for (let val of data.remotes) {
                    // Check validity of server state
                    if (!val.id || val.id < this._nextRemoteId || !JupyterServer.verifyServer(val))
                        continue;
                    maxID = Math.max(maxID, val.id);
                }
                this._nextRemoteId = maxID + 1;
                // Render UI with saved servers
                this.setState({remotes: data.remotes});
            })
            .catch((e) => {
                console.log(e);
            });
    }
    
    render() {
        let content = this.state.renderState();

        return (
            <div className='jpe-body'>
                {content}
            </div>
        );
    }
    
    private _launchFromPath() {
        ipcRenderer.send(ServerIPC.REQUEST_SERVER_START_PATH);

        let pathSelected = () => {
            this.setState({renderState: this._renderSplash});
            ipcRenderer.removeListener(ServerIPC.POST_PATH_SELECTED, pathSelected);
        }
        ipcRenderer.on(ServerIPC.POST_PATH_SELECTED, pathSelected);
    }

    private _saveState() {
        this._serverState.save(Application.SERVER_STATE_ID, {remotes: this.state.remotes});
    }

    private _setupLab(): Promise<void> {
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

            this._lab = new ElectronJupyterLab({
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
                this._lab.registerPluginModules(extensions.jupyterlab);
            } catch (e) {
                console.error(e);
            }
            
            res();
        });
    }

    private _connectionAdded(server: JupyterServer.IServer) {
        PageConfig.setOption('baseUrl', server.url);
        PageConfig.setOption('token', server.token);
        
        this._labReady.then(() => {
            try {
                this._lab.start({"ignorePlugins": this._ignorePlugins});
            } catch(e) {
                console.log(e);
            }
        });

        let rServer: Application.IRemoteServer = {...server, id: this._nextRemoteId++};

        this.setState((prev: ServerManager.State) => {
            server.id = this._nextRemoteId++;
            let conns = this.state.remotes.concat(rServer);
            return({
                renderState: this._renderLab,
                conns: {servers: conns}
            });
        });
    }

    private _renderServerManager(): JSX.Element {
        return (
            <div className='jpe-content'>
                <TitleBar uiState={this.props.options.uiState} />
                <ServerManager serverAdded={this._connectionAdded} />;
            </div>
        );
    }

    private _renderSplash(): JSX.Element {
        return (
            <div className='jpe-content'>
                <SplashScreen  ref='splash' uiState={this.props.options.uiState} finished={() => {
                    this.setState({renderState: this._renderLab});}
                } />
            </div>
        );
    }

    private _renderLab(): JSX.Element {
        this._saveState();

        return null;
    }

    private _renderErrorScreen(): JSX.Element {
        return (
            <div className='jpe-content'>
                <TitleBar uiState={this.props.options.uiState} />
                <ServerError launchFromPath={this._launchFromPath}/>
            </div>
        )
    }

    private _lab: ElectronJupyterLab;

    private _ignorePlugins: string[] = ['jupyter.extensions.server-manager'];

    private _server: JupyterServer.IServer = null;

    private _nextRemoteId: number = 1;
    
    private _serverState: StateDB;

    private _labReady: Promise<void>;
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
        options: IOptions;
    }

    export
    interface State {
        renderState: () => any;
        remotes: IRemoteServer[];
    }

    export
    interface IOptions extends JSONObject {
        uiState: JupyterLabWindow.UIState;
        serverState: JupyterLabWindow.ServerState;
        remoteServerId: number;
        platform: NodeJS.Platform;
    }

    export
    interface IRemoteServer extends JupyterServer.IServer {
        id: number;
    }

    export
    interface IRemoteServerState extends JSONObject {
        remotes: IRemoteServer[];
    }
}
