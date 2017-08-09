// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    app, globalShortcut, webContents
} from 'electron';

import {
    JupyterApplicationIPC as AppIPC
} from 'jupyterlab_app/src/ipc';

import {
    JupyterLabSession
} from './sessions';

import {
    JupyterApplication
} from './app';

/**
 * Interface for keyboard shortcuts recognized by the shortcut manager
 */
export
interface KeyboardShortcut {
    accelerator: string,
    command: () => void
}

export class KeyboardShortcutManager {

    /**
     * Create a new shortcut manager
     * 
     * @param options - The application windows
     */
    constructor(options: KeyboardShortcutManager.IOptions){
        this._windows = null;//options.jupyterApp.windows;
        app.on('browser-window-focus', (event:Event, window: Electron.BrowserWindow) => {
            if (!this._active){
                this.enableShortcuts();
            }
        });
        app.on('browser-window-blur', (event: Event, window: Electron.BrowserWindow) => {
            if (!this.isAppFocused()){
                this.disableShortcuts();
            }
        });
        app.on('window-all-closed', () => {
            this.disableShortcuts();
        });
    }

    /**
     * Enables all shortcuts
     */
    private enableShortcuts(){
        this._active = true;
        this._shortcuts.forEach( ({accelerator, command}) => {
            globalShortcut.register(accelerator, command);
        });
    }

    /**
     * Disables all shortcuts
     */
    private disableShortcuts(){
        this._active = false;
        globalShortcut.unregisterAll();
    }
    

    /**
     * Checks whether or not an application window is in focus
     * Note: There exists an "isFocused" method on BrowserWindow
     * objects, but it isn't a reliable indiciator of focus. 
     */
    private isAppFocused(): boolean{
        let visible = false;
        let focus = false;
        for (let i = 0; i < this._windows.length; i ++){
            let window = this._windows[i].browserWindow;
            if (window.isVisible()){
                visible = true;
            }
            if (window.isFocused()){
                focus = true;
            }
        }
        return visible && focus;
    }

    /**
     * Checks for application focus. Called when a browser window is closed.
     */
    public notifyWindowClosed(){
        if (!this.isAppFocused()){
            this.disableShortcuts();
        }
    }
    
    /**
     * Whether or not an application window exists and is in focus
     */
    private _active: boolean;

    /**
     * All application windows
     */
    private _windows: JupyterLabSession[];

    /**
     * The enabled shortcuts
     */
    private _shortcuts: KeyboardShortcut[] = [
        {accelerator: 'CmdOrCtrl+c', command: KeyboardCommands.copy},
        {accelerator: 'CmdOrCtrl+v', command: KeyboardCommands.paste},
        {accelerator: 'CmdOrCtrl+x', command: KeyboardCommands.cut},
        {accelerator: 'CmdOrCtrl+=', command: KeyboardCommands.zoomIn},
        {accelerator: 'CmdOrCtrl+-', command: KeyboardCommands.zoomOut},
        {accelerator: process.platform === 'darwin'? 'Cmd+q' : (process.platform === 'win32' ? 'Alt+F4' : 'Ctrl+Shift+q'), command: KeyboardCommands.quit}
    ];

}

export
namespace KeyboardShortcutManager {
    export
    interface IOptions {
        jupyterApp: JupyterApplication;
    }
}

/**
 * Basic keyboard commands
 */
class KeyboardCommands{

    static copy = function() {
        webContents.getFocusedWebContents().copy();
    };

    static paste = function() {
        webContents.getFocusedWebContents().paste();
    };

    static cut = function() {
        webContents.getFocusedWebContents().cut()
    };

    static zoomIn = function() {
        let contents = webContents.getFocusedWebContents();
        contents.getZoomLevel( (zoom: number) => {
            if (zoom >= 3) return;
            contents.setZoomLevel(zoom + 1);
            contents.send(AppIPC.POST_ZOOM_EVENT);
        });
    };

    static zoomOut = function() {
        let contents = webContents.getFocusedWebContents();
        contents.getZoomLevel( (zoom: number) => {
            if (zoom <= -7) return;
            contents.setZoomLevel(zoom - 1);
            contents.send(AppIPC.POST_ZOOM_EVENT);
        });
    };

    static quit = function () {
        app.quit();
    }
}