import {
    ChildProcess, spawn, execFile
} from 'child_process';

import {
    join
} from 'path';

import {
    app, ipcMain, dialog
} from 'electron';

import {
    JupyterServerIPC as ServerIPC
} from 'jupyterlab_app/src/ipc';

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
            let urlRegExp = /http:\/\/localhost:\d+\/\?token=\w+/g;
            let tokenRegExp = /token=\w+/g;
            let baseRegExp = /http:\/\/localhost:\d+\//g;
            let home = app.getPath("home");

            if (this._info.path) {
               this._nbServer = execFile(join(this._info.path, 'jupyter'), ['notebook', '--no-browser']);
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
                reject(new Error('Jupyter not installed'));
            });

            this._nbServer.on('error', (err: Error) => {
                this._serverStartFailed();
                reject(err);
            });

            this._nbServer.stderr.on('data', (serverBuff: string) => {
                let urlMatch = serverBuff.toString().match(urlRegExp);
                if (!urlMatch)
                    return; 

                let url = urlMatch[0].toString();
                this._info.token = (url.match(tokenRegExp))[0].replace("token=", "");
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
class JupyterServerFactory {
    
    constructor(options: JupyterServerFactory.IOptions) {
        // Register electron IPC listensers
        ipcMain.on(ServerIPC.REQUEST_SERVER_START, (event: any) => {
            this.requestServerStart({})
                .then((data: JupyterServerFactory.IFactoryItem) => {
                    event.sender.send(ServerIPC.RESPOND_SERVER_STARTED, this._factoryToIPC(data))
               })
                .catch((e: any) => {
                    event.sender.send(ServerIPC.RESPOND_SERVER_STARTED, this._errorToIPC(e))
                });
        });
        
        ipcMain.on(ServerIPC.REQUEST_SERVER_START_PATH, (event: any) => {
            this.getUserJupyterPath()
                .then((path: string) => {
                    event.sender.send(ServerIPC.POST_PATH_SELECTED);
                    this.requestServerStart({path})
                        .then((data: JupyterServerFactory.IFactoryItem) => {
                            event.sender.send(ServerIPC.RESPOND_SERVER_STARTED, this._factoryToIPC(data))
                        })
                        .catch((e) => {
                            event.sender.send(ServerIPC.RESPOND_SERVER_STARTED, this._errorToIPC(e))
                        });
               })
                .catch((e: any) => {
                    event.sender.send(ServerIPC.RESPOND_SERVER_STARTED, this._errorToIPC(e))
                });
        });
        
        ipcMain.on(ServerIPC.REQUEST_SERVER_STOP,
                    (event: any, arg: ServerIPC.IRequestServerStop) => {
            this.requestServerStop(arg.factoryId)
                .then(() => {})
                .catch((e) => {
                    console.error(e);
                });
        });
    }

    startFreeServer(opts: JupyterServer.IOptions): JupyterServerFactory.IFactoryItem {
        let server = new JupyterServer(opts)
        let item: JupyterServerFactory.IFactoryItem = {
            factoryId: this._nextId++,
            server: server,
            status: 'free'
        };
        server.start();
        this._servers.push(item);
        return item;
    }

    getFreeServer(opts: JupyterServer.IOptions): JupyterServerFactory.IFactoryItem | null {
        let idx = ArrayExt.findFirstIndex(this._servers, (server: JupyterServerFactory.IFactoryItem, idx: number) => {
            if (server.status == 'free' && opts.path == server.server.info.path)
                return true;
            return false;
        });

        if (idx < 0)
            return null;

        this._servers[idx].status = 'used';
        return this._servers[idx];
    }

    requestServerStart(opts: JupyterServer.IOptions): Promise<JupyterServerFactory.IFactoryItem> {
        let server = this.getFreeServer(opts)|| this.startFreeServer(opts);
        server.status = 'used';

        return new Promise<JupyterServerFactory.IFactoryItem>((res, rej) => {
            server.server.start()
                .then((data: JupyterServer.IInfo) => {
                    res(server);
                })
                .catch((e) => {
                    rej(e);
                    // Remove server from servers array
                    this.requestServerStop(server.factoryId);
                });
        })

    }

    requestServerStop(factoryId: number): Promise<void> {
        let idx = ArrayExt.findFirstIndex(this._servers, (s: JupyterServerFactory.IFactoryItem, idx: number) => {
            if (s.factoryId === factoryId)
                return true;
            return false;
        });

        if (idx < 0)
            return Promise.reject(new Error('Invalid server id: ' + factoryId));
        
        let server = this._servers[idx];
        return new Promise<void>((res, rej) => {
            server.server.stop()
                .then(() => {
                    ArrayExt.removeAt(this._servers, idx);
                    res();
                })
                .catch((e) => {
                    ArrayExt.removeAt(this._servers, idx);
                    console.error(e);
                    rej();
                });
        })

    }

    killAllServers(): Promise<void[]> {
        // Get stop promises from all servers
        let stopPromises = this._servers.map((val) => {
            return val.server.stop();
        });

        return Promise.all(stopPromises)
    }

    getUserJupyterPath(): Promise<string> {
        return new Promise<string>((res, rej) => {
            dialog.showOpenDialog({
                properties: ['openDirectory', 'showHiddenFiles'],
                buttonLabel: 'Use Path'
            }, (filePaths: string[]) => {
                if (!filePaths) {
                    rej(new Error('No path selected'));
                    return;
                } else {
                    res(filePaths[0]);
                }
            });

        })
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
            err: e || new Error('Server creation error')
        };
    }
    
    private _servers: JupyterServerFactory.IFactoryItem[] = [];

    private _nextId: number = 1;

}

export
namespace JupyterServerFactory {

    export
    interface IOptions {

    }

    export
    interface IFactoryItem {
        factoryId: number;
        status: 'used' | 'free';
        server: JupyterServer;
    }
}