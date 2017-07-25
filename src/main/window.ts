// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    BrowserWindow, ipcMain
} from 'electron';

import {
    JupyterWindowIPC as WindowIPC
} from 'jupyterlab_app/src/ipc';

import * as path from 'path';
import * as url from 'url';
import 'jupyterlab_app/src/browser/index.html';


export
class JupyterLabWindow {

    private _windowState: WindowIPC.WindowOptions = null;

    /**
     * Electron window
     */
    private _window: Electron.BrowserWindow = null;

    constructor(options: WindowIPC.WindowOptions) {
        this._windowState = options;

        if (!this._windowState.platform)
            this._windowState.platform = process.platform;

        this._window = new BrowserWindow({
            width: options.width || 800,
            height: options.height || 600,
            x: options.x,
            y: options.y,
            minWidth: 400,
            minHeight: 300,
            frame: false,
            show: false,
            title: 'JupyterLab'
        });
        
        ipcMain.on(WindowIPC.REQUEST_STATE_UPDATE, (evt: any, arg: any) => {
            for (let key in arg) {
                if ((this._windowState as any)[key])
                    (this._windowState as any)[key] = (arg as any)[key];
            }
        })
        
        this._window.webContents.on('did-finish-load', () =>{
            this._window.show();
        });
        
        this._window.loadURL(url.format({
            pathname: path.resolve(__dirname, "index.html"),
            protocol: 'file:',
            slashes: true,
            search: encodeURIComponent(JSON.stringify(options))
        }));
    }
    

    get isWindowVisible(): boolean {
        return this._window !== null;
    }

    get windowState(): WindowIPC.WindowOptions {
        let winBounds = this._window.getBounds();
        this._windowState.x = winBounds.x;
        this._windowState.y = winBounds.y;
        this._windowState.width = winBounds.width;
        this._windowState.height = winBounds.height;
        return this._windowState;
    }

    get browserWindow(): Electron.BrowserWindow {
        return this._window;
    }
}
