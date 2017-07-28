// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    app, globalShortcut, webContents
} from 'electron';

import {
    JupyterLabWindow
} from './window';

/**
 * Interface for keyboard shortcuts recognized by the shortcut manager
 */
export interface KeyboardShortcut{
    accelerator: string,
    command: () => void
}

export class KeyboardShortcutManager{

    /**
     * Whether or not an application window exists and is in focus
     */
    private active: boolean;

    /**
     * All application windows
     */
    private windows: JupyterLabWindow[];

    /**
     * The enabled shortcuts
     */
    private shortcuts: KeyboardShortcut[] = [
        {accelerator: 'CmdOrCtrl+c', command: KeyboardCommands.copy},
        {accelerator: 'CmdOrCtrl+v', command: KeyboardCommands.paste},
        {accelerator: 'CmdOrCtrl+x', command: KeyboardCommands.cut},
        {accelerator: 'CmdOrCtrl+=', command: KeyboardCommands.zoomIn},
        {accelerator: 'CmdOrCtrl+-', command: KeyboardCommands.zoomOut}
    ];

    /**
     * Create a new shortcut manager
     * 
     * @param windows - The application windows
     */
    constructor(windows: JupyterLabWindow[]){
        this.windows = windows;
        app.on('browser-window-focus', (event:Event, window: Electron.BrowserWindow) => {
            if (!this.active){
                this.enableShortcuts();
                this.active = true;
            }
        });
        app.on('browser-window-blur', (event: Event, window: Electron.BrowserWindow) => {
            if (!this.isAppFocused()){
                this.disableShortcuts();
                this.active = false;
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
        this.shortcuts.forEach( ({accelerator, command}) => {
            globalShortcut.register(accelerator, command);
        });
    }

    /**
     * Disables all shortcuts
     */
    private disableShortcuts(){
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
        for (let i = 0; i < this.windows.length; i ++){
            let window = this.windows[i].browserWindow;
            if (window.isVisible()){
                visible = true;
            }
            if (window.isFocused()){
                focus = true;
            }
        }
        return visible && focus;
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
        contents.getZoomLevel( (zoom) => {
            contents.setZoomLevel(zoom + 1);
        });
    };

    static zoomOut = function() {
        let contents = webContents.getFocusedWebContents();
        contents.getZoomLevel( (zoom) => {
            contents.setZoomLevel(zoom - 1);
        });
    };
}