import {
    ChildProcess, spawn, execFile
} from 'child_process';

import {
    join
} from 'path';

import {
    IService
} from './main';

import {
    app, ipcMain, dialog
} from 'electron';

import {
    JupyterServerIPC as ServerIPC
} from 'jupyterlab_app/src/ipc';

import{
    IApplication, IClosingService
} from './app';

import {
    ArrayExt
} from '@phosphor/algorithm';

export
class JupyterServer {

    constructor(options: JupyterServer.IOptions) {
        if (options.path)
            this._info.path = options.path;
    }

    get info(): JupyterServer.IInfo {
        return this._info;
    }
    
    /**
     * Start a local Jupyer server. This method can be
     * called multiple times without initiating multiple starts.
     * 
     * @return a promise that is resolved when the server has started.
     */
    public start(): Promise<JupyterServer.IInfo> {
        if (this._startServer) {
            return this._startServer;
        }

        this._startServer = new Promise<JupyterServer.IInfo>((resolve, reject) => {
            let urlRegExp = /http:\/\/localhost:\d+\/\S*/g;
            let tokenRegExp = /token=\w+/g;
            let baseRegExp = /http:\/\/localhost:\d+\//g;
            let home = app.getPath("home");

            if (this._info.path) {
               this._nbServer = execFile(join(this._info.path, 'jupyter'), ['notebook', '--no-browser'], {cwd: home});
            } else if (process.platform === "win32") {
                // Windows will return win32 (even for 64-bit)
                // Dont spawn shell for Windows
                this._nbServer = spawn('jupyter', ['notebook', '--no-browser'], {cwd: home});
            } else {
                this._nbServer = spawn('/bin/bash', ['-i', '-l'], {cwd: home});
                this._nbServer.stdin.write('exec jupyter notebook --no-browser || exit\n');
            }
            
            this._nbServer.on('exit', () => {
                this._serverStartFailed();
                reject(new Error('Could not find Jupyter in PATH'));
            });

            this._nbServer.on('error', (err: Error) => {
                this._serverStartFailed();
                reject(new Error('Could not find Jupyter in PATH'));
            });

            this._nbServer.stderr.on('data', (serverBuff: string) => {
                let urlMatch = serverBuff.toString().match(urlRegExp);
                if (!urlMatch)
                    return;

                let url = urlMatch[0].toString();
                let token = (url.match(tokenRegExp));
                
                if (!token) {
                    this._cleanupListeners();
                    reject(new Error("Update Jupyter notebook to version 4.3.0 or greater"));
                    return;
                }
                
                this._info.token = token[0].replace("token=", "");
                this._info.url = (url.match(baseRegExp))[0];

                this._cleanupListeners();
                resolve(this._info);
            });
        });

        return this._startServer;
    }

    /**
     * Stop the currently executing Jupyter server.
     * 
     * @return a promise that is resolved when the server has stopped.
     */
    public stop(): Promise<void> {
        // If stop has already been initiated, just return the promise
        if (this._stopServer)
            return this._stopServer;

        this._stopServer = new Promise<void>((res, rej) => {
            if (this._nbServer !== undefined){
                if (process.platform === "win32"){
                    execFile('taskkill', ['/PID', String(this._nbServer.pid), '/T', '/F'], () => {
                        res();
                    });
                }
                else{
                    this._nbServer.kill();
                    res();
                }
            }
            else{
                res();
            }
        });
        return this._stopServer;
    }

    private _serverStartFailed(): void {
        this._cleanupListeners();
        // Server didn't start, resolve stop promise
        this._stopServer = Promise.resolve();
    }

    private _cleanupListeners(): void {
        this._nbServer.removeAllListeners();
        this._nbServer.stderr.removeAllListeners();
    }
    
    /**
     * The child process object for the Jupyter server
     */
    private _nbServer: ChildProcess;

    private _stopServer: Promise<void> = null;

    private _startServer: Promise<JupyterServer.IInfo> = null;

    private _info: JupyterServer.IInfo = {url: null, token: null, path: null};
}

export
namespace JupyterServer {

    export
    interface IOptions {
        path?: string;
    }

    export
    interface IInfo {
        url: string;
        token: string;
        path: string;
    }
}

export
interface IServerFactory {
    
    /**
     * Create and start a 'free' server. The server created will be returned
     * in the next call to 'createServer'.
     * 
     * This method is a way to pre-launch Jupyter servers to improve load
     * times.
     * 
     * @param opts the Jupyter server options.
     * 
     * @return the factory item.
     */
    createFreeServer: (opts: JupyterServer.IOptions) => JupyterServerFactory.IFactoryItem;

    /**
     * Create a Jupyter server.
     * 
     * If a free server is available, it is preferred over
     * server creation.
     * 
     * @param opts the Jupyter server options.
     * @param forceNewServer force the creation of a new server over a free server.
     * 
     * @return the factory item.
     */
    createServer: (opts: JupyterServer.IOptions) => Promise<JupyterServerFactory.IFactoryItem>;
    
    /**
     * Kill all currently running servers.
     * 
     * @return a promise that is fulfilled when all servers are killed.
     */
    killAllServers: () => Promise<void[]>;
}

export
class JupyterServerFactory implements IServerFactory, IClosingService {
    
    constructor(app: IApplication) {
        app.registerClosingService(this);
        // Register electron IPC listensers
        ipcMain.on(ServerIPC.REQUEST_SERVER_START, (event: any) => {
            this.createServer({})
                .then((data: JupyterServerFactory.IFactoryItem) => {
                    event.sender.send(ServerIPC.RESPOND_SERVER_STARTED, this._factoryToIPC(data));
               })
                .catch((e: Error) => {
                    event.sender.send(ServerIPC.RESPOND_SERVER_STARTED, this._errorToIPC(e));
                });
        });
        
        ipcMain.on(ServerIPC.REQUEST_SERVER_START_PATH, (event: any) => {
            this.getUserJupyterPath()
                .then((path: string) => {
                    event.sender.send(ServerIPC.POST_PATH_SELECTED);
                    this.createServer({path})
                        .then((data: JupyterServerFactory.IFactoryItem) => {
                            event.sender.send(ServerIPC.RESPOND_SERVER_STARTED, this._factoryToIPC(data));
                        })
                        .catch((e) => {
                            event.sender.send(ServerIPC.RESPOND_SERVER_STARTED, this._errorToIPC(e));
                        });
               })
                .catch((e: Error) => {
                    if (e.message !== 'cancel'){
                        event.sender.send(ServerIPC.RESPOND_SERVER_STARTED, this._errorToIPC(e));

                    }
                });
        });
        
        ipcMain.on(ServerIPC.REQUEST_SERVER_STOP,
                    (event: any, arg: ServerIPC.IRequestServerStop) => {
            this.stopServer(arg.factoryId)
                .then(() => {})
                .catch((e) => {
                    console.error(e);
                });
        });
    }

    /**
     * Create and start a 'free' server. The server created will be returned
     * in the next call to 'createServer'.
     * 
     * This method is a way to pre-launch Jupyter servers to improve load
     * times.
     * 
     * @param opts the Jupyter server options.
     * 
     * @return the factory item.
     */
    createFreeServer(opts: JupyterServer.IOptions): JupyterServerFactory.IFactoryItem {
        let item = this._createServer(opts);

        item.server.start()
            .catch((e: Error) => {
                // The server failed to start, remove it from the factory.
                console.warn(e);
            });
        return item;
    }


    /**
     * Create a Jupyter server.
     * 
     * If a free server is available, it is preferred over
     * server creation.
     * 
     * @param opts the Jupyter server options.
     * @param forceNewServer force the creation of a new server over a free server.
     */
    createServer(opts: JupyterServer.IOptions, forceNewServer?: boolean): Promise<JupyterServerFactory.IFactoryItem> {
        let server: JupyterServerFactory.IFactoryItem;
        if (forceNewServer) {
            server = this._createServer(opts);
        } else {
            server = this._findUnusedServer(opts) || this._createServer(opts);
        }
        server.used = true;

        return new Promise<JupyterServerFactory.IFactoryItem>((res, rej) => {
            server.server.start()
                .then((data: JupyterServer.IInfo) => {
                    res(server);
                })
                .catch((e) => {
                    rej(e);
                    this._removeFailedServer(server.factoryId);
                });
        });
    }

    /**
     * Stop a Jupyter server.
     * 
     * @param factoryId the factory item id.
     */
    stopServer(factoryId: number): Promise<void> {
        let idx = this._getServerIdx(factoryId);
        if (idx < 0)
            return Promise.reject(new Error('Invalid server id: ' + factoryId));

        let server = this._servers[idx];
        if (server.closing){
            return server.closing;
        }
        let promise = new Promise<void>((res, rej) => {
            server.server.stop()
                .then(() => {
                    ArrayExt.removeAt(this._servers, idx);
                    res();
                })
                .catch((e) => {
                    console.error(e);
                    ArrayExt.removeAt(this._servers, idx);
                    rej();
                })
        });
        server.closing = promise;
        return promise;
    }

    /**
     * Kill all currently running servers.
     * 
     * @return a promise that is fulfilled when all servers are killed.
     */
    killAllServers(): Promise<void[]> {
        // Get stop promises from all servers
        let stopPromises = this._servers.map((val) => {
            return val.server.stop();
        });

        // Empty the server array.
        this._servers = [];

        return Promise.all(stopPromises)
    }

    finished(): Promise<void> {
        let promise = new Promise<void>( (resolve, reject) => {
            this.killAllServers()
            .then( () => {resolve()})
            .catch( () => {reject()});
        });
        return promise;
    }

    /**
     * Open a file selection dialog so users
     * can enter the local path to the Jupyter server.
     * 
     * @return a promise that is fulfilled with the user path.
     */
    getUserJupyterPath(): Promise<string> {
        return new Promise<string>((res, rej) => {
            dialog.showOpenDialog({
                properties: ['openDirectory', 'showHiddenFiles'],
                buttonLabel: 'Use Path'
            }, (filePaths: string[]) => {
                if (!filePaths) {
                    rej(new Error('cancel'));
                    return;
                } else {
                    res(filePaths[0]);
                }
            });

        })
    }

    private _createServer(opts: JupyterServer.IOptions): JupyterServerFactory.IFactoryItem {
        let item: JupyterServerFactory.IFactoryItem = {
            factoryId: this._nextId++,
            server: new JupyterServer(opts),
            closing: null,
            used: false
        };

        this._servers.push(item);
        return item;
    }

    private _findUnusedServer(opts: JupyterServer.IOptions): JupyterServerFactory.IFactoryItem | null {
        let idx = ArrayExt.findFirstIndex(this._servers, (server: JupyterServerFactory.IFactoryItem, idx: number) => {
            if (!server.used && opts.path == server.server.info.path)
                return true;
            return false;
        });

        if (idx < 0)
            return null;

        return this._servers[idx];
    }

    private _removeFailedServer(factoryId: number): void {
        let idx = this._getServerIdx(factoryId);
        if (idx < 0)
            return;
        ArrayExt.removeAt(this._servers, idx);
    }

    private _getServerIdx(factoryId: number): number {
        return ArrayExt.findFirstIndex(this._servers, (s: JupyterServerFactory.IFactoryItem, idx: number) => {
            if (s.factoryId === factoryId)
                return true;
            return false;
        });
    }

    private _factoryToIPC(data: JupyterServerFactory.IFactoryItem): ServerIPC.IServerStarted {
        let info = data.server.info;
        return {
            factoryId: data.factoryId,
            url: info.url,
            token: info.token
        };
    }
    
    private _errorToIPC(e: Error): ServerIPC.IServerStarted {
        return {
            factoryId: -1,
            url: null,
            token: null,
            err: e.message || 'Server creation error'
        };
    }
    
    private _servers: JupyterServerFactory.IFactoryItem[] = [];

    private _nextId: number = 1;

}

export
namespace JupyterServerFactory {

    /**
     * The object created by the JupyterServerFactory. 
     */
    export
    interface IFactoryItem {

        /**
         * The factory ID. Used to keep track of the server.
         */
        readonly factoryId: number;

        /**
         * Whether the server is currently used.
         */
        used: boolean;

        /**
         * A promise that is declared when the server is closing
         * and resolved on close.
         */
        closing: Promise<void>;

        /**
         * The actual Jupyter server object.
         */
        server: JupyterServer;
    }
}

let service: IService = {
    requirements: ['IApplication'],
    provides: 'IServerFactory',
    activate: (app: IApplication): IServerFactory => {
        return new JupyterServerFactory(app);
    },
    autostart: true
}
export default service;
