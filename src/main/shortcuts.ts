// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    app, globalShortcut, webContents
} from 'electron';

import {
    JupyterApplicationIPC as AppIPC
} from 'jupyterlab_app/src/ipc';

import {
    ISessions
} from './sessions';

import {
    IService
} from './main';

export
interface IShortcutManager {}

/**
 * Interface for keyboard shortcuts recognized by the shortcut manager
 */
export
interface KeyboardShortcut {
    accelerator: string,
    command: () => void
}

export class KeyboardShortcutManager implements IShortcutManager {

    /**
     * Create a new shortcut manager
     * 
     * @param options - The application windows
     */
    constructor(sessions: ISessions){
        this._sessions = sessions;
        
        this._sessions.on('session-ended', () => {
            if (!this._sessions.isAppFocused()){
                this.disableShortcuts();
            }
        });

        app.on('browser-window-focus', (event:Event, window: Electron.BrowserWindow) => {
            if (!this._active){
                this.enableShortcuts();
            }
        });

        app.on('browser-window-blur', (event: Event, window: Electron.BrowserWindow) => {
            if (!this._sessions.isAppFocused()){
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
     * Whether or not an application window exists and is in focus
     */
    private _active: boolean;

    /**
     * All application windows
     */
    private _sessions: ISessions;

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

let service: IService = {
    requirements: ['ISessions'],
    provides: 'IKeyboardManager',
    activate: (sessions: ISessions): IShortcutManager => {
        return new KeyboardShortcutManager(sessions);
    },
    autostart: true
}
export default service;