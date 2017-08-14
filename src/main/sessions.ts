// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { 
    BrowserWindow, ipcMain, dialog, app
} from 'electron';

import {
    JSONObject
} from '@phosphor/coreutils';

import {
    JupyterWindowIPC as WindowIPC,
    JupyterApplicationIPC as AppIPC
} from 'jupyterlab_app/src/ipc';

import {
    IApplication, IStatefulService
} from './app';

import {
    IServerFactory
} from './server';

import { 
    ArrayExt
} from "@phosphor/algorithm";

import {
    IService
} from './main';

import {
    EventEmitter
} from 'events';

import * as path from 'path';
import * as url from 'url';
import 'jupyterlab_app/src/browser/index.html';


export
interface ISessions extends EventEmitter {
    createSession: (opts?: JupyterLabSession.IOptions) => void;

    isAppFocused: () => boolean;

    length: number;
}

export
class JupyterLabSessions extends EventEmitter implements ISessions, IStatefulService {

    readonly id = 'JupyterLabSessions';
    
    constructor(app: IApplication, serverFactory: IServerFactory) {
        super();

        this._serverFactory = serverFactory;
        
        // check if UI state was set by user
        for (let arg of process.argv) {
            if (arg == '--windows-ui') {
                this._uiState = 'windows';
            } else if (arg == '--mac-ui') {
                this._uiState = 'mac';
            } else if (arg == '--linux-ui') {
                this._uiState = 'linux';
            }
        }

        this._registerListeners();

        // Get last session state
        app.registerStatefulService(this)
            .then((state: JupyterLabSession.IState) => {
                this._lastWindowState = state;
                this.createSession();
            })
            .catch(() => {
                this.createSession();
            });
    }

    get length(): number {
        return this._sessions.length;
    }
    
    /**
     * Checks whether or not an application window is in focus
     * Note: There exists an "isFocused" method on BrowserWindow
     * objects, but it isn't a reliable indiciator of focus. 
     */
    isAppFocused(): boolean{
        let visible = false;
        let focus = false;
        for (let i = 0; i < this._sessions.length; i++) {
            let window = this._sessions[i].browserWindow;
            if (window.isVisible()){
                visible = true;
            }
            if (window.isFocused()){
                focus = true;
            }
        }
        return visible && focus;
    }
    
    createSession(opts?: JupyterLabSession.IOptions): void {
        if (opts) {
            this._createSession(opts);
        } else if (this._lastWindowState) {
            this._createSession(this._lastWindowState)
        } else {
            this._createSession({state: 'local'});
        }
    }
    
    getStateBeforeQuit(): Promise<JupyterLabSession.IState> {
        return Promise.resolve(this._lastWindowState);
    }

    verifyState(state: JupyterLabSession.IState): boolean {
        if (!state.state || typeof state.state !== 'string')
            return false;
        if (!state.x || typeof state.x !== 'number')
            return false;
        if (!state.y || typeof state.y !== 'number')
            return false;
        if (!state.width || typeof state.width !== 'number')
            return false;
        if (!state.height || typeof state.height !== 'number')
            return false;
        if (state.state == 'remote' && (!state.remoteServerId || typeof state.remoteServerId !== 'number'))
            return false;
        return true;
    }

    private _createSession(opts: JupyterLabSession.IOptions) {
        opts.uiState = opts.uiState || this._uiState;
        
        // pre launch a local server to improve load time
        if (opts.state == 'local')
            this._serverFactory.createFreeServer({})

        let session = new JupyterLabSession(opts);
        // Register dialog on window close
        session.browserWindow.on('close', (event: Event) => {
            let buttonClicked = dialog.showMessageBox({
                type: 'warning',
                message: 'Do you want to leave?',
                detail: 'Changes you made may not be saved.',
                buttons: ['Leave', 'Stay'],
                defaultId: 0,
                cancelId: 1
            });
            
            if (buttonClicked === 1) {
                // Stop the window from closing
                event.preventDefault();
                return;
            }
            
            // Save session state
            this._lastWindowState = session.state();
        });
        
        session.browserWindow.on('closed', (event: Event) => {
            ArrayExt.removeFirstOf(this._sessions, session);
            session = null;
            this.emit('session-ended');
        });
        
        this._sessions.push(session);
    }
    
    private _registerListeners(): void {
        // On OS X it's common to re-create a window in the app when the dock icon is clicked and there are no other
        // windows open.
        // Need to double check this code to ensure it has expected behaviour
        app.on('activate', () => {
            if (this._sessions.length > 0) {
                if (BrowserWindow.getFocusedWindow() === null) {
                    this._sessions[0].browserWindow.focus();
                }
                return;
            }
            this.createSession()
        });

        app.on('open-file', (e: any, path: string) => {
            let session = this._getFocusedSession();
            if (session === null || session.state().state !== 'local' ){
                let state: JupyterLabSession.IOptions = null;
                if (this._lastWindowState){
                    state = this._lastWindowState;
                }
                state.state = 'local';
                this._createSession(state);
                ipcMain.once(AppIPC.LAB_READY, (event: Electron.Event) => {
                    event.sender.send(AppIPC.OPEN_FILES, path);
                });
            }
            else {
                session.browserWindow.webContents.send(AppIPC.OPEN_FILES, path);
            }
        });


        ipcMain.on(AppIPC.REQUEST_ADD_SERVER, (event: any, arg: any) => {
            this._createSession({state: 'new'});
        });
        
        ipcMain.on(AppIPC.REQUEST_OPEN_CONNECTION, (event: any, arg: AppIPC.IOpenConnection) => {
            if (arg.type == 'remote')
                this._createSession({state: 'remote', remoteServerId: arg.remoteServerId});
            else
                this._createSession({state: 'local'});
        });

        // The path sent should correspond to the directory the app is started in
        // (the directory passed into the "cwd" flag on server startup)
        ipcMain.on(AppIPC.REQUEST_LAB_HOME_DIR, (event: any) => {
            event.sender.send(AppIPC.LAB_HOME_DIR, app.getPath("home"));
        });
    }

    private _getFocusedSession(): JupyterLabSession{
        let sessions = this._sessions;
        for (let i = 0; i < sessions.length; i ++){
            if (sessions[i].browserWindow.isFocused())
                return sessions[i];
        }
        if (sessions.length > 0)
            return sessions[0];
        return null;
    }

    private _sessions: JupyterLabSession[] = [];

    private _lastWindowState: JupyterLabSession.IState;

    private _serverFactory: IServerFactory;

    private _uiState: JupyterLabSession.UIState;
}

export
class JupyterLabSession {

    constructor(options: JupyterLabSession.IOptions) {
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
    
    get info(): JupyterLabSession.IInfo {
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

    state(): JupyterLabSession.IState {
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

    private _info: JupyterLabSession.IInfo = null;

    private _window: Electron.BrowserWindow = null;

}

export
namespace JupyterLabSession {

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

let service: IService = {
    requirements: ['IApplication', 'IServerFactory'],
    provides: 'ISessions',
    activate: (app: IApplication, serverFactory: IServerFactory): ISessions => {
        return new JupyterLabSessions(app, serverFactory);
    },
    autostart: true
}
export default service;