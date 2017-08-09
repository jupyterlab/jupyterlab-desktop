// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    BrowserWindow, ipcMain, dialog, app
} from 'electron';

import {
    JSONObject
} from '@phosphor/coreutils';

import {
    JupyterWindowIPC as WindowIPC,
    JupyterApplicationIPC as AppIPC
} from 'jupyterlab_app/src/ipc';

import {
    IApplication, IStatefulService
} from './app';

import {
    JupyterServerFactory
} from './server';

import { 
    ArrayExt
} from "@phosphor/algorithm";

import {
    IService
} from './main';

import * as path from 'path';
import * as url from 'url';
import 'jupyterlab_app/src/browser/index.html';


export
interface ISessions {
    createSession: (opts?: JupyterLabSession.IOptions) => void;

    numSessions: number;
}

export
class JupyterLabSessions implements ISessions, IStatefulService {

    readonly id = 'JupyterLabSessions';
    
    constructor(app: IApplication, state: JSONObject) {
        let sessions: JupyterLabSession.IState[] = null;
        if (state && state.sessions) {
            sessions = state.sessions as JupyterLabSession.IState[];
        }

        this._registerListeners();

        if (!sessions) {
            // Start JupyterLab with local sever by sending local server id
            // Prelaunch local server to improve performance
            this._serverFactory.startFreeServer();
            this._createWindow({state: 'local'});
            return;
        }
        
        for (let s of sessions) {
            this._createWindow(s);
        }
    }

    get numSessions(): number {
        return this._sessions.length;
    }
    
    getState(): JSONObject {
        return null;
    }

    private _createWindow(state: JupyterLabSession.IOptions) {
        let uiState: JupyterLabSession.UIState;
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

        let window = new JupyterLabSession(state);
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
            if (this._sessions.length == 1) {
                // Save application state
            }
        });
        
        window.browserWindow.on('closed', (event: Event) => {
            ArrayExt.removeFirstOf(this._sessions, window);
            window = null;
            //this._shortcutManager.notifyWindowClosed();
        });
        
        this._sessions.push(window);
    }
    
    private _registerListeners(): void {
        // On OS X it's common to re-create a window in the app when the dock icon is clicked and there are no other
        // windows open.
        // Need to double check this code to ensure it has expected behaviour
        app.on('activate', () => {
            this.createSession()
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
    
    createSession(opts?: JupyterLabSession.IOptions): void {
        console.log('Create Session!');
        if (opts) {
            this._createWindow(opts);
            return;
        }

        if (this._sessions.length === 0) {
            //if (this._appState.windows.length > 0) {
            //    this._createWindow(this._appState.windows[0]);
            //}
            //else {
                this._createWindow({state: 'local'});
            //}
        }
        else if (BrowserWindow.getFocusedWindow() === null){
            this._sessions[0].browserWindow.focus();
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
    

    private _sessions: JupyterLabSession[];

    private _serverFactory: JupyterServerFactory;
}

export
class JupyterLabSession {

    constructor(options: JupyterLabSession.IOptions) {
        this._info = {
            state: options.state,
            platform: options.platform || process.platform,
            uiState: options.uiState,
            x: options.x,
            y: options.y,
            width: options.width || 800,
            height: options.height || 600,
            remoteServerId: options.remoteServerId
        }

        if (!this._info.uiState) {
            if (this._info.platform == 'darwin') {
                this._info.uiState = 'mac';
            } else if (this._info.platform == 'linux') {
                this._info.uiState = 'linux';
            } else {
                this._info.uiState = 'windows';
            }
        }
        
        let titleBarStyle: 'default' | 'hidden' = 'default';
        if (this._info.uiState == 'mac') {
            titleBarStyle = 'hidden';
        }
        let showFrame = false;
        if (this._info.uiState == 'linux') {
            showFrame = true;
        }

        this._window = new BrowserWindow({
            width: this._info.width,
            height: this._info.height,
            x: this._info.x,
            y: this._info.y,
            minWidth: 400,
            minHeight: 300,
            frame: showFrame,
            show: false,
            title: 'JupyterLab',
            titleBarStyle: titleBarStyle
        });

        if (this._info.x && this._info.y) {
            this._window.setBounds({x: this._info.x, y: this._info.y, height: this._info.height, width: this._info.width });
        }
        else {
            this._window.center();
        }

        this._addRenderAPI();

        this._window.webContents.on('did-finish-load', () =>{
            this._window.show();
        });
        
        // Create window state object to pass to the render process
        let windowState: WindowIPC.IWindowState = {
            serverState: this._info.state,
            remoteServerId: this._info.remoteServerId,
            uiState: this._info.uiState,
            platform: this._info.platform
        }

        this._window.loadURL(url.format({
            pathname: path.resolve(__dirname, "index.html"),
            protocol: 'file:',
            slashes: true,
            search: encodeURIComponent(JSON.stringify(windowState))
        }));
    }
    
    get info(): JupyterLabSession.IInfo {
        let winBounds = this._window.getBounds();
        this._info.x = winBounds.x;
        this._info.y = winBounds.y;
        this._info.width = winBounds.width;
        this._info.height = winBounds.height;
        return this._info;
    }
    
    get browserWindow(): Electron.BrowserWindow {
        return this._window;
    }

    state(): JupyterLabSession.IState {
        let info = this.info;

        return {
            x: info.x,
            y: info.y,
            width: info.width,
            height: info.height,
            state: info.state,
            remoteServerId: info.remoteServerId
        }
    }

    private _addRenderAPI(): void {
        ipcMain.on(WindowIPC.REQUEST_STATE_UPDATE, (evt: any, arg: any) => {
            for (let key in arg) {
                if ((this._info as any)[key])
                    (this._info as any)[key] = (arg as any)[key];
            }
        });

        this._window.on('maximize', () => {
            this._window.webContents.send(WindowIPC.POST_MAXIMIZE_EVENT);
        });
        
        this._window.on('minimize', () => {
            this._window.webContents.send(WindowIPC.POST_MINIMIZE_EVENT);
        });
        
        this._window.on('unmaximize', () => {
            this._window.webContents.send(WindowIPC.POST_UNMAXIMIZE_EVENT);
        });
        
        this._window.on('restore', () => {
            this._window.webContents.send(WindowIPC.POST_RESTORE_EVENT);
        });

    }

    private _info: JupyterLabSession.IInfo = null;

    private _window: Electron.BrowserWindow = null;

}

export
namespace JupyterLabSession {

    export
    type UIState = 'linux' | 'mac' | 'windows';

    export
    type ServerState = 'new' | 'local' | 'remote';

    export
    interface IOptions {
        state: ServerState;
        platform?: NodeJS.Platform;
        uiState?: UIState;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        remoteServerId?: number;
    }

    export
    interface IInfo {
        state: ServerState;
        platform: NodeJS.Platform;
        uiState: UIState;
        x: number;
        y: number;
        width: number;
        height: number;
        remoteServerId?: number;
    }

    export
    interface IState extends JSONObject {
        state: ServerState;
        x: number;
        y: number;
        width: number;
        height: number;
        remoteServerId?: number;
    }
}

let service: IService = {
    requirements: ['IApplication'],
    provides: 'ISessions',
    activate: (app: IApplication): ISessions => {
        return new JupyterLabSessions(app, null);
    },
    autostart: true
}
export default service;