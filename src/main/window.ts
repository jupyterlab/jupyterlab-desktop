// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    dialog, BrowserWindow
} from 'electron';

import {
    ElectronStateDB
} from './state';

import {
    JSONObject
} from '@phosphor/coreutils';

import * as path from 'path';
import * as url from 'url';

interface WindowState extends JSONObject {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}

export
class JupyterLabWindow {

    /**
     * Object to store the size and position of the window.
     */
    private windowStateDB = new ElectronStateDB({namespace: 'jupyter-window-data'});

    private windowState: WindowState = null;

    /**
     * Promise that is fulfilled when all application
     * state is loaded from the filesystem.
     */
    private stateLoaded: Promise<void>;

    /**
     * Electron window
     */
    private window: Electron.BrowserWindow = null;

    get isWindowVisible(): boolean {
        return this.window !== null;
    }

    createWindow(): void {

        if (this.window)
            return;
        
        this.window = new BrowserWindow({
            width: 800,
            height: 600,
            minWidth: 400,
            minHeight: 300,
            show: false,
            title: 'JupyterLab'
        });
        
        this.registerListeners();

        this.window.loadURL(url.format({
            pathname: path.resolve(__dirname, '../../../src/browser/index.html'),
            protocol: 'file:',
            slashes: true
        }));

        this.stateLoaded = new Promise<void>((res, rej) => {
            if (this.windowState) {
                this.window.setBounds(this.windowState as Electron.Rectangle);
                res();
            } else {
                this.windowStateDB.fetch(JupyterLabWindow.STATE_NAMESPACE)
                    .then((state: JSONObject) => {
                        this.windowState = state;
                        if (!state) {
                            this.windowState = {};
                            res();
                            return;
                        }

                        if (state.x && state.y && state.width && state.height)
                            this.window.setBounds(this.windowState as Electron.Rectangle);
                        else
                            this.window.center();
                        res();
                    }).catch(()=>{ res(); });
            }
        });
    }
    
    /**
     * Get window dimensions and position
     * and write the data to a file.
     */
    private updateState() {
        let winBounds = this.window.getBounds();
        this.windowState.x = winBounds.x;
        this.windowState.y = winBounds.y;
        this.windowState.width = winBounds.width;
        this.windowState.height = winBounds.height;
        this.windowStateDB.save(JupyterLabWindow.STATE_NAMESPACE, this.windowState);
    }

    /**
     * Register listeners on window events
     */
    private registerListeners() {

        this.window.webContents.on('did-finish-load', () =>{
            this.stateLoaded.then(() => {
                this.window.show();
            }).catch(()=>{});
        });

        // Register dialog on window close
        this.window.on('close', (event: Event) => {

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
            /* Save window data */
            this.updateState();
        });

        this.window.on('closed', (event: Event) => {
            /* Set window object to get GC to cleanup */
            this.window = null;
        });
    }
}

export
namespace JupyterLabWindow {
    export
    let STATE_NAMESPACE = 'window-state';
}