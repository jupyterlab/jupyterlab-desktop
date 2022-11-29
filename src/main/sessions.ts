// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { app, ipcMain } from 'electron';

import { JSONObject } from '@lumino/coreutils';

import { IApplication, IStatefulService } from './app';

import { IServerFactory, JupyterServer } from './server';

import { ArrayExt } from '@lumino/algorithm';

import { IService } from './main';

import { IRegistry } from './registry';

import { appConfig } from './utils';

import { EventEmitter } from 'events';

import * as fs from 'fs';
import * as path from 'path';
import { MainWindow } from './mainwindow/mainwindow';
import { LabView } from './labview/labview';

export interface ISessions extends EventEmitter {
  createSession: (opts?: JupyterLabSession.IOptions) => Promise<void>;

  isAppFocused: () => boolean;

  length: number;
}

export class JupyterLabSessions
  extends EventEmitter
  implements ISessions, IStatefulService {
  readonly id = 'JupyterLabSessions';

  constructor(
    app: IApplication,
    serverFactory: IServerFactory,
    registry: IRegistry
  ) {
    super();
    this._serverFactory = serverFactory;
    this._registry = registry;
    this._app = app;

    // check if UI state was set by user
    for (let arg of process.argv) {
      if (arg === '--windows-ui') {
        this._uiState = 'windows';
      } else if (arg === '--mac-ui') {
        this._uiState = 'mac';
      } else if (arg === '--linux-ui') {
        this._uiState = 'linux';
      }
    }

    this._registerListeners();

    // Get last session state
    app
      .registerStatefulService(this)
      .then((state: JupyterLabSession.IState) => {
        this._lastWindowState = state;

        app.getServerInfo().then(serverInfo => {
          if (serverInfo.type === 'local') {
            if (this._registry.getCurrentPythonEnvironment()) {
              this.createSession().then(() => {
                this._startingSession = null;
              });
            }
          } else {
            let options: JupyterLabSession.IOptions = {
              state: appConfig.isRemote ? 'remote' : 'local'
            };
            if (this._lastWindowState) {
              options = { ...this._lastWindowState, ...options };
            }
            this.createSession(options).then(() => {
              this._startingSession = null;
            });
          }
        });
      })
      .catch(() => {
        app.getServerInfo().then(serverInfo => {
          this.createSession().then(() => {
            this._startingSession = null;
          });
        });
      });
  }

  get length(): number {
    return this._sessions.length;
  }

  /**
   * Checks whether or not an application window is in focus
   * Note: There exists an "isFocused" method on BrowserWindow
   * objects, but it isn't a reliable indicator of focus.
   */
  isAppFocused(): boolean {
    let visible = false;
    let focus = false;
    for (let i = 0; i < this._sessions.length; i++) {
      let window = this._sessions[i].browserWindow;
      if (window.isVisible()) {
        visible = true;
      }
      if (window.isFocused()) {
        focus = true;
      }
    }
    return visible && focus;
  }

  createSession(opts?: JupyterLabSession.IOptions): Promise<void> {
    if (opts) {
      return this._createSession(opts);
    } else if (this._lastWindowState) {
      return this._createSession(this._lastWindowState);
    } else {
      return this._createSession({ state: 'local' });
    }
  }

  getStateBeforeQuit(): Promise<JupyterLabSession.IState> {
    return Promise.resolve(this._lastWindowState);
  }

  setFocusedSession(session: JupyterLabSession): void {
    this._lastFocusedSession = session;
  }

  verifyState(state: JupyterLabSession.IState): boolean {
    if (!state.state || typeof state.state !== 'string') {
      return false;
    }
    if (!state.x || typeof state.x !== 'number') {
      return false;
    }
    if (!state.y || typeof state.y !== 'number') {
      return false;
    }
    if (!state.width || typeof state.width !== 'number') {
      return false;
    }
    if (!state.height || typeof state.height !== 'number') {
      return false;
    }
    if (
      state.state === 'remote' &&
      (!state.remoteServerId || typeof state.remoteServerId !== 'number')
    ) {
      return false;
    }
    return true;
  }

  get lastFocusedSession(): JupyterLabSession | null {
    return this._lastFocusedSession;
  }

  get app(): IApplication {
    return this._app;
  }

  private _createSession(opts: JupyterLabSession.IOptions): Promise<void> {
    this._startingSession = new Promise<void>(resolve => {
      opts.uiState = opts.uiState || this._uiState;
      // pre launch a local server to improve load time
      if (opts.state === 'local') {
        if (opts.serverOpts) {
          this._serverFactory.createFreeServer(opts.serverOpts);
        } else {
          this._serverFactory.createFreeServer({} as JupyterServer.IOptions);
        }
      }

      let session = new JupyterLabSession(this, opts);

      // Register dialog on window close
      session.browserWindow.on('close', (event: Event) => {
        // Save session state
        this._lastWindowState = session.state();

        // close application when JupyterLab window is closed
        app.quit();
      });

      session.browserWindow.on('closed', (event: Event) => {
        if (this._lastFocusedSession === session) {
          this._lastFocusedSession = null;
        }
        ArrayExt.removeFirstOf(this._sessions, session);
        session = null;
        this.emit('session-ended');
      });

      this._sessions.push(session);
      this._lastFocusedSession = session;
      session.browserWindow.on('focus', () => {
        resolve();
      });
    });
    return this._startingSession;
  }

  private _registerListeners(): void {
    // On OS X it's common to re-create a window in the app when the dock icon is clicked and there are no other
    // windows open.
    // Need to double check this code to ensure it has expected behaviour
    // TODO: double check
    app.on('ready', () => {
      if (this._startingSession) {
        return;
      }
      if (this._sessions.length === 0) {
        this.createSession().then(() => {
          this._startingSession = null;
        });
        return;
      }
      if (this._lastFocusedSession) {
        this._lastFocusedSession.browserWindow.restore();
        this._lastFocusedSession.browserWindow.focus();
        return;
      }
      this._sessions[0].browserWindow.restore();
      this._sessions[0].browserWindow.focus();
    });

    ipcMain.once('lab-ui-ready', () => {
      if (appConfig.isRemote) {
        this._startingSession = null;
        return;
      }
      // Skip JupyterLab executable
      for (let i = 1; i < process.argv.length; i++) {
        this._activateLocalSession().then(() => {
          this._openFile(path.resolve(process.argv[i]));
          this._startingSession = null;
        });
      }
      app.removeAllListeners('open-file');
      app.on('open-file', (e: Electron.Event, path: string) => {
        this._activateLocalSession().then(() => {
          this._openFile(path);
          this._startingSession = null;
        });
      });
    });
  }

  /**
   * Returns a promise that is resolved when a local session is created and ready
   */
  private _activateLocalSession(): Promise<void> {
    if (this._startingSession) {
      return this._startingSession;
    }
    this._startingSession = new Promise<void>(resolve => {
      let session = this._lastFocusedSession;
      if (session && session.state().state === 'local') {
        session.browserWindow.focus();
        session.browserWindow.restore();
        resolve();
      } else {
        let state: JupyterLabSession.IOptions = { state: null };
        if (this._lastWindowState) {
          state = this._lastWindowState;
        }
        state.state = 'local';
        this.createSession(state).then(() => {
          ipcMain.once('lab-ui-ready', () => {
            resolve();
          });
        });
      }
    });
    return this._startingSession;
  }

  /**
   * Sends the file path to the renderer process to be opened in the application.
   * @param path the absolute path to the file
   */
  private _openFile(path: string): void {
    this._isFile(path)
      .then(() => {
        let session = this._lastFocusedSession;
        session.browserWindow.restore();
        session.browserWindow.focus();
        session.labView.view.webContents.send('open-file-event', path);
      })
      .catch((error: any) => {
        return;
      });
  }

  /**
   * Returns a promise that is resolved if the path is a file
   * and rejects if it is not.
   * @param path the absolute path to the file
   */
  private _isFile(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.lstat(path, (err: any, stats: fs.Stats) => {
        try {
          if (stats === null || stats === undefined) {
            reject();
          } else if (err) {
            reject();
          } else if (stats.isFile()) {
            resolve();
          }
          reject();
        } catch (error: any) {
          reject();
        }
      });
    });
  }

  private _startingSession: Promise<void> = null;

  private _lastFocusedSession: JupyterLabSession = null;

  private _sessions: JupyterLabSession[] = [];

  private _lastWindowState: JupyterLabSession.IState;

  private _serverFactory: IServerFactory;

  private _registry: IRegistry;

  private _uiState: JupyterLabSession.UIState;

  private _app: IApplication;
}

export class JupyterLabSession {
  constructor(
    sessionManager: JupyterLabSessions,
    options: JupyterLabSession.IOptions
  ) {
    this._sessionManager = sessionManager;

    this._info = {
      serverState: options.state,
      platform: options.platform || process.platform,
      uiState: options.uiState,
      x: options.x,
      y: options.y,
      width: options.width || 800,
      height: options.height || 600,
      remoteServerId: options.remoteServerId
    };

    if (!this._info.uiState) {
      if (this._info.platform === 'darwin') {
        this._info.uiState = 'mac';
      } else if (this._info.platform === 'linux') {
        this._info.uiState = 'linux';
      } else {
        this._info.uiState = 'windows';
      }
    }

    this._window = new MainWindow(this._info);

    this._window.window.on('focus', () => {
      this._sessionManager.setFocusedSession(this);
    });

    sessionManager.app.pageConfigSet.then(() => {
      this._window.load();
    });
  }

  get info(): JupyterLabSession.IInfo {
    let winBounds = this._window.window.getBounds();
    this._info.x = winBounds.x;
    this._info.y = winBounds.y;
    this._info.width = winBounds.width;
    this._info.height = winBounds.height;
    return this._info;
  }

  get browserWindow(): Electron.BrowserWindow {
    return this._window.window;
  }

  get labView(): LabView {
    return this._window.labView;
  }

  state(): JupyterLabSession.IState {
    let info = this.info;

    return {
      x: info.x,
      y: info.y,
      width: info.width,
      height: info.height,
      state: info.serverState,
      remoteServerId: info.remoteServerId
    };
  }

  private _sessionManager: JupyterLabSessions = null;

  private _info: JupyterLabSession.IInfo = null;

  private _window: MainWindow = null;
}

export namespace JupyterLabSession {
  export type UIState = 'linux' | 'mac' | 'windows';

  export type ServerState = 'new' | 'local' | 'remote';

  export interface IOptions {
    state: ServerState;
    platform?: NodeJS.Platform;
    uiState?: UIState;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    remoteServerId?: number;
    serverOpts?: JupyterServer.IOptions;
  }

  export interface IInfo {
    serverState: ServerState;
    platform: NodeJS.Platform;
    uiState: UIState;
    x: number;
    y: number;
    width: number;
    height: number;
    remoteServerId?: number;
  }

  export interface IState extends JSONObject {
    state: ServerState;
    x: number;
    y: number;
    width: number;
    height: number;
    remoteServerId?: number;
  }
}

let sessions: JupyterLabSessions;

/**
 * The "open-file" listener should be registered before
 * app ready for "double click" files to open in application
 */
if (process && process.type !== 'renderer' && !appConfig.isRemote) {
  app.once('will-finish-launching', (e: Electron.Event) => {
    app.on('open-file', (event: Electron.Event, path: string) => {
      ipcMain.once('lab-ui-ready', (event: Electron.Event) => {
        if (sessions?.lastFocusedSession) {
          sessions.lastFocusedSession.labView.view.webContents.send(
            'open-file-event',
            path
          );
        }
      });
    });
  });
}

let service: IService = {
  requirements: ['IApplication', 'IServerFactory', 'IRegistry'],
  provides: 'ISessions',
  activate: (
    app: IApplication,
    serverFactory: IServerFactory,
    registry: IRegistry
  ): ISessions => {
    sessions = new JupyterLabSessions(app, serverFactory, registry);
    return sessions;
  },
  autostart: true
};
export default service;
