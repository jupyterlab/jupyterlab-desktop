// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    app, ipcMain, dialog
} from 'electron';

import {
    ChildProcess, spawn, execFile
} from 'child_process';

import {
    JupyterMainMenu
} from './menu';

import {
    JupyterLabWindow
} from './window';

import {
    JupyterServerIPC,
    JupyterApplicationIPC as AppIPC
} from '../ipc';

import {
    ElectronStateDB
} from './state';

import {
    JSONObject
} from '@phosphor/coreutils';

import {
    ArrayExt
} from '@phosphor/algorithm';


export
class JupyterServer {
    /**
     * The child process object for the Jupyter server
     */
    private nbServer: ChildProcess;

    private _desc: JupyterServer.ServerDesc;

    get desc() {
        return this._desc;
    }
    
    /**
     * Start a local Jupyer server on the specified port. Returns
     * a promise that is fulfilled when the Jupyter server has
     * started and all the required data (url, token, etc.) is
     * collected. This data is collected from the data written to
     * std out upon sever creation
     */
    public start(): Promise<JupyterServer.ServerDesc> {
        return new Promise((resolve, reject) => {
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
    public stop(): void {
        if (this.nbServer !== undefined){
            if (process.platform === "win32"){
                execFile('taskkill', ['/PID', String(this.nbServer.pid), '/T', '/F'], () => {
                    process.exit();
                });
            }
            else{
                this.nbServer.kill();
                process.exit();
            }
        }
        else{
            process.exit();
        }
    }
}

export
namespace JupyterServer {

    export
    interface ServerDesc {
        url: string;
        token: string;
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
        let id = this.nextId++;
        let item: JupyterServerFactory.FactoryItem = {id: id, server: server, status: 'free'};
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
    
    public createFreeServer(): JupyterServer {
        return this._createFreeServer().server;
    }

    private registerListeners() {
        ipcMain.on(JupyterServerIPC.Channels.REQUEST_SERVER_START, (event: any, arg: any) => {
            let server = this._getFreeServer() || this._createFreeServer();

            server.server.start()
                .then((data: JupyterServer.ServerDesc) => {
                    event.sender.send(JupyterServerIPC.Channels.SERVER_STARTED, 
                                    {id: server.id, server: server.server.desc});
                })
                .catch(() => {
                    event.sender.send(JupyterServerIPC.Channels.SERVER_STARTED,
                                    {id: -1, server: null});
                })
        });
        
        ipcMain.on(JupyterServerIPC.Channels.REQUEST_SERVER_STOP,
                    (event: any, arg: JupyterServerIPC.Data.JupyterServer) => {

            let idx = ArrayExt.findFirstIndex(this.servers, (value: JupyterServerFactory.FactoryItem, idx: number) => {
                if (value.id === arg.id)
                    return true;
                return false;
            });
            this.servers[idx].server.stop();
        });

    }
}

namespace JupyterServerFactory {

    export
    interface FactoryItem {
        status: 'used' | 'free';
        id: number;
        server: JupyterServer;
    }
}

const APPLICATION_STATE_NAMESPACE = 'jupyter-lab-app';

interface ApplicationState extends JSONObject {
    windows: JupyterLabWindow.WindowState[];
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
    private windows: JupyterLabWindow[] = [];

    /**
     * Construct the Jupyter application
     */
    constructor() {
        this.registerListeners();
        this.menu = new JupyterMainMenu();
        this.serverFactory = new JupyterServerFactory();
        
        this.appStateDB.fetch(APPLICATION_STATE_NAMESPACE)
            .then((state: ApplicationState) => {
                this.appState = state;
                this.start(state);
            })
    }

    private createWindow(state: JupyterLabWindow.WindowState) {
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
                /* Stop the window from closing */
                event.preventDefault();
                return;
            }
            /* If this is the last open window, save the state so we can reopen it */
            if (this.windows.length == 1) {
                if (!this.appState) this.appState = {windows: null};
                this.appState.windows = this.windows.map((w: JupyterLabWindow) => {
                    return w.windowState;
                });
            }
            
            ArrayExt.removeFirstOf(this.windows, window);
            window = null;
        });
        
        this.windows.push(window);
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
            /* This should check the window array to see if a window
            is already open */
            this.createWindow({});
        });

        app.on('will-quit', (event) => {
            event.preventDefault();
            this.appStateDB.save(APPLICATION_STATE_NAMESPACE, this.appState);
        });
        
        ipcMain.on(AppIPC.Channels.GET_PLATFORM, (event: any, arg: any) => {
            event.sender.send(AppIPC.Channels.SEND_PLATFORM, process.platform);
        });

        ipcMain.on(AppIPC.Channels.START_SERVER_MANAGER_WINDOW, (event: any, arg: any) => {
            this.createWindow({serverID: -1});
        })
    }

    /**
     * Creates windows based on data in application state. If no data is avalable
     * we start the initial start state.
     */
    private start(state: ApplicationState): void {
        if (!state || !state.windows || state.windows.length == 0) {
            /* Start JupyterLab with local sever by sending local server id */
            /* Prelaunch local server to improve performance */
            this.serverFactory.createFreeServer();
            this.createWindow({serverID: 1});
            return;
        }
        
        for (let window of state.windows) {
            this.createWindow(window)
        }
    }
}
