// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    BrowserWindow, ipcMain
} from 'electron';

import {
    JSONObject
} from '@phosphor/coreutils';

import {
    JupyterWindowIPC as WindowIPC,
} from 'jupyterlab_app/src/ipc';

import * as path from 'path';
import * as url from 'url';
import 'jupyterlab_app/src/browser/index.html';


export
class JupyterLabWindow {

    constructor(options: JupyterLabWindow.IOptions) {
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
    
    get info(): JupyterLabWindow.IInfo {
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

    state(): JupyterLabWindow.IState {
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

    private _info: JupyterLabWindow.IInfo = null;

    private _window: Electron.BrowserWindow = null;

}

export
namespace JupyterLabWindow {

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