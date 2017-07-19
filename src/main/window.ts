// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    BrowserWindow
} from 'electron';

import {
    JSONObject
} from '@phosphor/coreutils';

import * as path from 'path';
import * as url from 'url';


export
class JupyterLabWindow {

    private _windowState: JupyterLabWindow.WindowState = null;

    /**
     * Electron window
     */
    private _window: Electron.BrowserWindow = null;

    constructor(options: JupyterLabWindow.WindowState) {
        this._windowState = options;

        this._window = new BrowserWindow({
            width: options.width || 800,
            height: options.height || 600,
            minWidth: 400,
            minHeight: 300,
            show: false,
            title: 'JupyterLab'
        });
        
        this._window.webContents.on('did-finish-load', () =>{
            this._window.show();
        });

        this._window.loadURL(url.format({
            pathname: path.resolve(__dirname, '../../../src/browser/index.html'),
            protocol: 'file:',
            slashes: true,
            search: encodeURIComponent(JSON.stringify({serverId: options.serverID || -1}))
        }));

    }
    

    get isWindowVisible(): boolean {
        return this._window !== null;
    }

    get windowState(): JupyterLabWindow.WindowState {
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

export
namespace JupyterLabWindow {

    export
    interface WindowState extends JSONObject {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        serverID?: number;
    }
}