// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    BrowserWindow, ipcMain, session
} from 'electron';

import {
    JupyterWindowIPC as WindowIPC,
    JupyterServerIPC as ServerIPC
} from 'jupyterlab_app/src/ipc';

import * as path from 'path';
import * as url from 'url';
import 'jupyterlab_app/src/browser/index.html';


export
class JupyterLabWindow {

    private _info: JupyterLabWindow.IInfo = null;

    /**
     * Electron window
     */
    private _window: Electron.BrowserWindow = null;

    constructor(options: JupyterLabWindow.IOptions) {
        this._info = {
            state: options.state,
            platform: options.platform || process.platform,
            uiState: options.uiState,
            x: options.x,
            y: options.y,
            width: options.width,
            height: options.width,
            serverId: options.serverId
        }

        if (!this._info.uiState) {
            if (this._info.platform == 'darwin')
                this._info.uiState = 'mac';
            else if (this._info.platform == 'linux')
                this._info.uiState = 'linux';
            else
                this._info.uiState = 'windows';
        }
        
        let showFrame = false;
        if (this._info.uiState == 'linux') {
            showFrame = true;


        this._window = new BrowserWindow({
            width: options.width || 800,
            height: options.height || 600,
            x: options.x,
            y: options.y,
            minWidth: 400,
            minHeight: 300,
            frame: showFrame,
            show: false,
            title: 'JupyterLab',
            titleBarStyle: 'hidden'
        });

        ipcMain.on(WindowIPC.REQUEST_STATE_UPDATE, (evt: any, arg: any) => {
            for (let key in arg) {
                if ((this._info as any)[key])
                    (this._info as any)[key] = (arg as any)[key];
            }
        })
        
        this._window.webContents.on('did-finish-load', () =>{
            this._window.show();
        });
        
        this._window.loadURL(url.format({
            pathname: path.resolve(__dirname, "index.html"),
            protocol: 'file:',
            slashes: true,
            search: encodeURIComponent(JSON.stringify(this._info))
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
        uiState?: JupyterLabWindow.UIState;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        serverId?: number;
    }

    export
    interface IInfo {
        state: ServerState;
        platform: NodeJS.Platform;
        uiState: JupyterLabWindow.UIState;
        x: number;
        y: number;
        width: number;
        height: number;
        serverId?: number;
    }
}

export
class AuthenticationWindow {

    private _info: AuthenticationWindow.IInfo = null;

    private _authenticated: Promise<ServerIPC.ServerDesc>;
    
    /**
     * Electron window
     */
    private _window: Electron.BrowserWindow = null;

    constructor(options: AuthenticationWindow.IOptions) {
        this._info = {
            url: options.url
        }
        
        this._window = new BrowserWindow({
            width: 400,
            height: 200,
            minWidth: 400,
            minHeight: 200,
            show: true,
            title: 'JupyterLab'
        });
        
        this._window.loadURL(this._info.url);

        this._authenticated = new Promise<ServerIPC.ServerDesc>((res, rej) => {
            session.defaultSession.cookies.on('changed', (evt: Electron.Event) => {
                session.defaultSession.cookies.get({name: '_xsrf'}, (error: Error, cookies: any[]) => {
                    if (error || cookies.length == 0)
                        return;

                    console.log(cookies[0]);
                    let server: ServerIPC.ServerDesc = {
                        url: 'http://localhost:8000/user/luc/',
                        type: 'remote',
                        token: cookies[0].value,
                        id: 0,
                        name: null
                    };
                    session.defaultSession.cookies.removeAllListeners();
                    res(server);
                });
            });
        })

    }
    
    get info(): AuthenticationWindow.IInfo {
        return this._info;
    }

    get browserWindow(): Electron.BrowserWindow {
        return this._window;
    }

    get authenticated(): Promise<ServerIPC.ServerDesc> {
        return this._authenticated;
    }
}

export
namespace AuthenticationWindow {

    export
    interface IOptions {
        url: string;
    }

    export
    interface IInfo {
        url: string;
    }
}