// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    dialog, BrowserWindow
} from 'electron';

import {
    UserState
} from './state';

import * as path from 'path';
import * as url from 'url';

type Rectangle = Electron.Rectangle;

interface WindowState {
    winBounds?: Rectangle;
}

export
class JupyterLabWindow {

    private windowState = new UserState<WindowState>('jupyter-window-data', {});

    private statePromise: Promise<void>;

    private window: Electron.BrowserWindow;

    constructor() {
        this.window = new BrowserWindow({
            width: 800,
            height: 600,
            minWidth: 400,
            minHeight: 300,
            show: false,
            title: 'JupyterLab'
        });
        
        this.statePromise = new Promise<void>((res, rej) => {
            this.windowState.read().then(() => {
                let state = this.windowState.state

                if (state.winBounds)
                    this.window.setBounds(state.winBounds);
                else
                    this.window.center();
                res();
            }).catch(()=>{});
        });

        this.registerListeners();

        this.window.loadURL(url.format({
            pathname: path.resolve(__dirname, '../../../src/browser/index.html'),
            protocol: 'file:',
            slashes: true
        }));
    }
    
    private updateState() {
        let bounds = this.window.getBounds();
        this.windowState.state.winBounds = bounds;
        this.windowState.write();
    }

    private registerListeners() {
        this.window.webContents.on('did-finish-load', () =>{
            this.statePromise.then(() => {
                this.window.show();
            }).catch(()=>{});
        });

        // Register dialog on window close
        this.window.on('close', (event: Event) => {
            /* Save window data */
            this.updateState();

            let buttonClicked = dialog.showMessageBox({
            type: 'warning',
            message: 'Do you want to leave?',
            detail: 'Changes you made may not be saved.',
            buttons: ['Leave', 'Stay'],
            defaultId: 0,
            cancelId: 1
            });
            if (buttonClicked === 1) {
                event.preventDefault();
            }
        });
    }
}