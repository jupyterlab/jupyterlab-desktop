// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    app, ipcMain, dialog, BrowserWindow
} from 'electron';

import {
    ChildProcess, spawn, execFile
} from 'child_process';

import {
    JupyterMainMenu
} from 'jupyterlab_app/src/main/menu';

import {
    JupyterLabWindow
} from 'jupyterlab_app/src/main/window';

import {
    JupyterServerIPC as ServerIPC,
    JupyterApplicationIPC as AppIPC,
    JupyterWindowIPC as WindowIPC
} from 'jupyterlab_app/src/ipc';

import {
    ElectronStateDB
} from 'jupyterlab_app/src/main/state';

import {
    JSONObject
} from '@phosphor/coreutils';

import {
    ArrayExt
} from '@phosphor/algorithm';

import {
    KeyboardShortcutManager
} from 'jupyterlab_app/src/main/shortcuts'




export
class JupyterServer {
    /**
     * The child process object for the Jupyter server
     */
    private nbServer: ChildProcess;

    private stopServer: Promise<void> = null;

    private _desc: ServerIPC.ServerDesc = {name: null, id: null, type: 'local'};

    get desc(): ServerIPC.ServerDesc {
        return this._desc;
    }

    get id(): number {
        return this._desc.id;
    }
    
    set id(id: number) {
        this._desc.id = id;
    }

    get name(): string {
        return this._desc.name;
    }

    set name(name: string) {
        this._desc.name = name;
    }
    
    /**
     * Start a local Jupyer server on the specified port. Returns
     * a promise that is fulfilled when the Jupyter server has
     * started and all the required data (url, token, etc.) is
     * collected. This data is collected from the data written to
     * std out upon sever creation
     */
    public start(): Promise<ServerIPC.ServerDesc> {
        return new Promise<ServerIPC.ServerDesc>((resolve, reject) => {
            let urlRegExp = /http:\/\/localhost:\d+\/\?token=\w+/g;
            let tokenRegExp = /token=\w+/g;
            let baseRegExp = /http:\/\/localhost:\d+\//g;
            let home = app.getPath("home");

            /* Windows will return win32 (even for 64-bit) */
            if (process.platform === "win32"){
                /* Dont spawns shell for Windows */
                this.nbServer = spawn('jupyter', ['notebook', '--no-browser'], {cwd: home});
            }
            else{
                this.nbServer = spawn('/bin/bash', ['-i'], {cwd: home});
            }

            this.nbServer.on('error', (err: Error) => {
                this.nbServer.stderr.removeAllListeners();
                reject(err);
            });

            this.nbServer.stderr.on('data', (serverBuff: string) => {
                let urlMatch = serverBuff.toString().match(urlRegExp);
                if (!urlMatch)
                    return; 

                let url = urlMatch[0].toString();
                this._desc = {
                    name: null,
                    id: null,
                    type: 'local',
                    token: (url.match(tokenRegExp))[0].replace("token=", ""),
                    url: (url.match(baseRegExp))[0]
                }
                this.nbServer.removeAllListeners();
                this.nbServer.stderr.removeAllListeners();

                resolve(this._desc);
            });

  
            if (process.platform !== "win32"){
                this.nbServer.stdin.write('exec jupyter notebook --no-browser\n');
            }
        });
    }

    /**
     * Stop the currently executing Jupyter server
     */
    public stop(): Promise<void> {
        // If stop has already been initiated, just return the promise
        if (this.stopServer)
            return this.stopServer;

        this.stopServer = new Promise<void>((res, rej) => {
            if (this.nbServer !== undefined){
                if (process.platform === "win32"){
                    execFile('taskkill', ['/PID', String(this.nbServer.pid), '/T', '/F'], () => {
                        res();
                    });
                }
                else{
                    this.nbServer.kill();
                    res();
                }
            }
            else{
                res();
            }
        });
        return this.stopServer;
    }
}

class JupyterServerFactory {
    
    private servers: JupyterServerFactory.FactoryItem[] = [];

    private nextId: number = 1;

    constructor() {
        this.registerListeners();
    }

    private _createFreeServer(): JupyterServerFactory.FactoryItem {
        let server = new JupyterServer()
        let item: JupyterServerFactory.FactoryItem = {
            factoryId: this.nextId++,
            server: server,
            status: 'free'
        };
        this.servers.push(item);
        return item;
    }

    private _getFreeServer(): JupyterServerFactory.FactoryItem | null {
        let idx = ArrayExt.findFirstIndex(this.servers, (server: JupyterServerFactory.FactoryItem, idx: number) => {
            if (server.status == 'free')
                return true;
            return false;
        });

        if (idx < 0)
            return null;

        this.servers[idx].status = 'used';
        return this.servers[idx];
    }

    public getFreeServer(): JupyterServer | null {
        return this._getFreeServer().server;
    }
    
    public createFreeServer(): void {
        this._createFreeServer();
    }

    killAllServers(): Promise<void> {
        /* Get stop promises from all servers */
        let stopPromises = this.servers.map((val) => {
            return val.server.stop();
        });

        return new Promise<void>((res, rej) => {
            Promise.all(stopPromises)
                .then(() => res())
                .catch((e) => rej(e));
        });
    }

    private registerListeners() {
        ipcMain.on(ServerIPC.REQUEST_SERVER_START, (event: any) => {
            let server = this._getFreeServer()
            
            if (!server) {
                server = this._createFreeServer();
                server.status = 'used';
            }

            server.server.start()
                .then((data: ServerIPC.ServerDesc) => {
                    event.sender.send(ServerIPC.RESPOND_SERVER_STARTED, {
                        factoryId: server,
                        server: server.server.desc
                    })
                })
                .catch((e) => {
                    event.sender.send(ServerIPC.RESPOND_SERVER_STARTED,{
                        id: -1,
                        server: null,
                        err: e || new Error('Server creation error')
                    });
                });
        });
        
        ipcMain.on(ServerIPC.REQUEST_SERVER_STOP,
                    (event: any, arg: ServerIPC.RequestServerStop) => {

            let idx = ArrayExt.findFirstIndex(this.servers, (s: JupyterServerFactory.FactoryItem, idx: number) => {
                if (s.factoryId === arg.factoryId)
                    return true;
                return false;
            });

            if (idx < 0)
                return;

            this.servers[idx].server.stop()
                .then(() => {
                    ArrayExt.removeAt(this.servers, idx);
                })
                .catch((e) => {
                    console.error(e);
                    ArrayExt.removeAt(this.servers, idx);
                });
        });

    }
}

namespace JupyterServerFactory {

    export
    interface FactoryItem {
        factoryId: number;
        status: 'used' | 'free';
        server: JupyterServer;
    }
}

const APPLICATION_STATE_NAMESPACE = 'jupyter-lab-app';

interface ApplicationState extends JSONObject {
    windows: WindowIPC.WindowOptions[];
}

export class JupyterApplication {

    /**
     * Controls the native menubar
     */
    private menu: JupyterMainMenu;

    private serverFactory: JupyterServerFactory;

    /**
     * Object to store the size and position of the window.
     */
    private appStateDB = new ElectronStateDB({namespace: 'jupyterlab-application-data'});

    private appState: ApplicationState;

    /**
     * The JupyterLab window
     */
    private _windows: JupyterLabWindow[] = [];
    
    get windows(): JupyterLabWindow[] {
        return this._windows;
    }

    private shortcutManager: KeyboardShortcutManager;

    /**
     * Construct the Jupyter application
     */
    constructor() {
        this.shortcutManager = new KeyboardShortcutManager(this.windows);
        this.registerListeners();
        this.menu = new JupyterMainMenu(this);
        this.serverFactory = new JupyterServerFactory();
        
        this.appStateDB.fetch(APPLICATION_STATE_NAMESPACE)
            .then((state: ApplicationState) => {
                this.appState = state;
                this.start(state);
            })
    }

    private createWindow(state: WindowIPC.WindowOptions) {

        let uiState: JupyterLabWindow.UIState;
        for (let arg of process.argv) {
            if (arg == '--windows-ui') {
                uiState = 'windows';
            } else if (arg == '--mac-ui') {
                uiState = 'mac';
            } else if (arg == '--linux-ui') {
                uiState = 'linux';
            }
        }
        state.uiState = uiState;

        let window = new JupyterLabWindow(state);
        // Register dialog on window close
        window.browserWindow.on('close', (event: Event) => {
            let buttonClicked = dialog.showMessageBox({
                type: 'warning',
                message: 'Do you want to leave?',
                detail: 'Changes you made may not be saved.',
                buttons: ['Leave', 'Stay'],
                defaultId: 0,
                cancelId: 1
            });
            
            if (buttonClicked === 1) {
                // Stop the window from closing
                event.preventDefault();
                return;
            }
            
            // If this is the last open window, save the state so we can reopen it
            if (this._windows.length == 1) {
                if (!this.appState) this.appState = {windows: null};
                this.appState.windows = this._windows.map((w: JupyterLabWindow) => {
                    return w.windowState;
                });
            }
        });
        
        window.browserWindow.on('closed', (event: Event) => {
            ArrayExt.removeFirstOf(this._windows, window);
            window = null;
        });
        
        this._windows.push(window);
    }

    /**
     * Register all application event listeners
     */
    private registerListeners(): void {
        // On OS X it is common for applications and their menu bar to stay 
        // active until the user quits explicitly with Cmd + Q.
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        // On OS X it's common to re-create a window in the app when the dock icon is clicked and there are no other
        // windows open.
        // Need to double check this code to ensure it has expected behaviour
        app.on('activate', () => {
            if (this._windows.length === 0) {
                this.createWindow({state: 'local'});
            }
            else if (BrowserWindow.getFocusedWindow() === null){
                this._windows[0].browserWindow.focus();
            }
        });

        app.on('will-quit', (event) => {
            event.preventDefault();
            this.appStateDB.save(APPLICATION_STATE_NAMESPACE, this.appState)
                .then(() => {
                    this.serverFactory.killAllServers()
                        .then(() => process.exit())
                        .catch((e) => {
                            console.error(e);
                            process.exit();
                        });
                }).catch(() => {
                    this.serverFactory.killAllServers()
                        .then(() => process.exit())
                        .catch((e) => {
                            console.error(e);
                            process.exit();
                        });
                });
        });
        
        ipcMain.on(AppIPC.REQUEST_ADD_SERVER, (event: any, arg: any) => {
            this.createWindow({state: 'new'});
        });
        
        ipcMain.on(AppIPC.REQUEST_OPEN_CONNECTION, (event: any, arg: ServerIPC.ServerDesc) => {
            if (arg.type == 'remote')
                this.createWindow({state: 'remote', serverId: arg.id});
            else
                this.createWindow({state: 'local'});
        });
    }

    /**
     * Creates windows based on data in application state. If no data is avalable
     * we start the initial start state.
     */
    private start(state: ApplicationState): void {
        if (!state || !state.windows || state.windows.length == 0) {
            // Start JupyterLab with local sever by sending local server id
            // Prelaunch local server to improve performance
            this.serverFactory.createFreeServer();
            this.createWindow({state: 'local'});
            return;
        }
        
        for (let window of state.windows) {
            this.createWindow(window)
        }
    }

    /**
    * Create a new window running on a new local server 
    */
    public newLocalServer(){
        this.createWindow({state: 'local'});
    }

    /**
    * Create a new window prompting user for server information
    * Does not start a new local server (unless prompted by user)
    */
    public addServer(){
        this.createWindow({state: 'new'});
    }
}
