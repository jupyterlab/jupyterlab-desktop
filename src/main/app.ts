// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    app, ipcMain, dialog, BrowserWindow
} from 'electron';

import {
    JupyterMainMenu
} from 'jupyterlab_app/src/main/menu';

import {
    JupyterLabWindow
} from 'jupyterlab_app/src/main/window';

import {
    JupyterServerFactory
} from 'jupyterlab_app/src/main/server';

import {
    JupyterApplicationIPC as AppIPC,
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
class JupyterApplication {

    /**
     * Construct the Jupyter application
     */
    constructor() {
        this._registerListeners();
        this._menu = new JupyterMainMenu(this);
        this._serverFactory = new JupyterServerFactory({});
        
        this._appStateDB.fetch(JupyterApplication.APP_STATE_NAMESPACE)
            .then((state: JupyterApplication.IState) => {
                this._appState = state;
                this._start(state);
            })
    }

    get windows(): JupyterLabWindow[] {
        return this._windows;
    }

    private _createWindow(state: JupyterLabWindow.IOptions) {
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
                this._appState.windows = this._windows.map((w: JupyterLabWindow) => {
                    return w.state();
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
    private _registerListeners(): void {
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
                this._createWindow({state: 'local'});
            }
            else if (BrowserWindow.getFocusedWindow() === null){
                this._windows[0].browserWindow.focus();
            }
        });

        app.on('will-quit', (event) => {
            event.preventDefault();
            this._appStateDB.save(JupyterApplication.APP_STATE_NAMESPACE, this._appState)
                .then(() => {
                    this._serverFactory.killAllServers()
                        .then(() => process.exit())
                        .catch((e) => {
                            console.error(e);
                            process.exit();
                        });
                }).catch(() => {
                    this._serverFactory.killAllServers()
                        .then(() => process.exit())
                        .catch((e) => {
                            console.error(e);
                            process.exit();
                        });
                });
        });
        
        ipcMain.on(AppIPC.REQUEST_ADD_SERVER, (event: any, arg: any) => {
            this._createWindow({state: 'new'});
        });
        
        ipcMain.on(AppIPC.REQUEST_OPEN_CONNECTION, (event: any, arg: AppIPC.IOpenConnection) => {
            if (arg.type == 'remote')
                this._createWindow({state: 'remote', remoteServerId: arg.remoteServerId});
            else
                this._createWindow({state: 'local'});
        })
    }

    private _start(state: JupyterApplication.IState): void {
        if (!state || !state.windows || state.windows.length == 0) {
            // Start JupyterLab with local sever by sending local server id
            // Prelaunch local server to improve performance
            this._serverFactory.startFreeServer();
            this._createWindow({state: 'local'});
            return;
        }
        
        for (let window of state.windows) {
            this._createWindow(window)
        }
    }

    /**
    * Create a new window running on a new local server 
    */
    public newLocalServer(){
        this._createWindow({state: 'local'});
    }

    /**
    * Create a new window prompting user for server information
    * Does not start a new local server (unless prompted by user)
    */
    public addServer(){
        this._createWindow({state: 'new'});
    }
    
    private _menu: JupyterMainMenu;

    private _serverFactory: JupyterServerFactory;

    private _appStateDB = new ElectronStateDB({namespace: 'jupyterlab-application-data'});

    private _appState: JupyterApplication.IState;

    private _windows: JupyterLabWindow[] = [];

}

export
namespace JupyterApplication {

    export
    const APP_STATE_NAMESPACE = 'jupyter-lab-app';

    export
    interface IState extends JSONObject {
        windows: JupyterLabWindow.IState[];
    }
}