import {
    ChildProcess, spawn, execFile
} from 'child_process';

import {
    app, ipcMain
} from 'electron';

import {
    JupyterServerIPC as ServerIPC
} from 'jupyterlab_app/src/ipc';

import {
    ArrayExt
} from '@phosphor/algorithm';

export
class JupyterServer {

    constructor(options: JupyterServer.IOptions) {}

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

            // Windows will return win32 (even for 64-bit)
            if (process.platform === "win32") {
                // Dont spawns shell for Windows
                this._nbServer = spawn('jupyter', ['notebook', '--no-browser'], {cwd: home});
            }
            else{
                this._nbServer = spawn('/bin/bash', ['-i', '-l'], {cwd: home});
            }

            this._nbServer.on('error', (err: Error) => {
                this._cleanupListeners();
                reject(err);
            });

            this._nbServer.on('exit', () => {
                this._cleanupListeners();
                reject(new Error('Jupyter not installed'));
            });

            this._nbServer.stderr.on('data', (serverBuff: string) => {
                let urlMatch = serverBuff.toString().match(urlRegExp);
                if (!urlMatch)
                    return;

                let url = urlMatch[0].toString();
                let token = (url.match(tokenRegExp));
                
                if (!token) {
                    this._cleanupListeners();
                    reject(new Error("Update Jupyter version"));
                    return;
                }
                
                this._info = {
                    token: token[0].replace("token=", ""),
                    url: (url.match(baseRegExp))[0]
                }

                this._cleanupListeners();
                resolve(this._info);
            });

  
            if (process.platform !== "win32"){
                this._nbServer.stdin.write('exec jupyter notebook --no-browser || exit\n');
            }
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

    private _cleanupListeners() {
        this._nbServer.removeAllListeners();
        this._nbServer.stderr.removeAllListeners();
    }
    
    /**
     * The child process object for the Jupyter server
     */
    private _nbServer: ChildProcess;

    private _stopServer: Promise<void> = null;

    private _startServer: Promise<JupyterServer.IInfo> = null;

    private _info: JupyterServer.IInfo = {url: null, token: null};
}

export
namespace JupyterServer {

    export
    interface IOptions {
    }

    export
    interface IInfo {
        url: string;
        token: string;
    }
}

export
class JupyterServerFactory {
    
    constructor(options: JupyterServerFactory.IOptions) {
        // Register electron IPC listensers
        ipcMain.on(ServerIPC.REQUEST_SERVER_START, (event: any) => {
            this.requestServerStart()
                .then((data: JupyterServerFactory.IFactoryItem) => {
                    let info = data.server.info;
                    event.sender.send(ServerIPC.RESPOND_SERVER_STARTED, {
                        factoryId: data.factoryId,
                        url: info.url,
                        token: info.token
                    } as ServerIPC.IServerStarted);
                })
                .catch((e: any) => {
                    event.sender.send(ServerIPC.RESPOND_SERVER_STARTED,{
                        factoryId: -1,
                        url: null,
                        token: null,
                        err: e || new Error('Server creation error')
                    } as ServerIPC.IServerStarted);
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

    startFreeServer(): JupyterServerFactory.IFactoryItem {
        let server = new JupyterServer({})
        let item: JupyterServerFactory.IFactoryItem = {
            factoryId: this._nextId++,
            server: server,
            status: 'free'
        };
        server.start();
        this._servers.push(item);
        return item;
    }

    getFreeServer(): JupyterServerFactory.IFactoryItem | null {
        let idx = ArrayExt.findFirstIndex(this._servers, (server: JupyterServerFactory.IFactoryItem, idx: number) => {
            if (server.status == 'free')
                return true;
            return false;
        });

        if (idx < 0)
            return null;

        this._servers[idx].status = 'used';
        return this._servers[idx];
    }

    requestServerStart(): Promise<JupyterServerFactory.IFactoryItem> {
        let server = this.getFreeServer() || this.startFreeServer();
        server.status = 'used';

        return new Promise<JupyterServerFactory.IFactoryItem>((res, rej) => {
            server.server.start()
                .then((data: JupyterServer.IInfo) => {
                    res(server);
                })
                .catch((e) => {
                    rej(e);
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

        return new Promise<void>((res, rej) => {
            this._servers[idx].server.stop()
                .then(() => {
                    ArrayExt.removeAt(this._servers, idx);
                    res();
                })
                .catch((e) => {
                    console.error(e);
                    ArrayExt.removeAt(this._servers, idx);
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