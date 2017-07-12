// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    dialog, BrowserWindow
} from 'electron';

import {
    ApplicationState
} from './state';

import * as path from 'path';
import * as url from 'url';

type Rectangle = Electron.Rectangle;

interface WindowState {
    winBounds?: Rectangle;
}

export
class JupyterLabWindow {

    /**
     * Object to store the size and position of the window.
     */
    private windowState = new ApplicationState<WindowState>('jupyter-window-data');

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
            if (this.windowState.state) {
                this.window.setBounds(this.windowState.state.winBounds);
                res();
            } else {
                this.windowState.read().then(() => {
                    let state = this.windowState.state
                    if (state.winBounds)
                        this.window.setBounds(state.winBounds);
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
        this.windowState.state.winBounds = this.window.getBounds();
        this.windowState.write();
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