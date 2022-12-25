// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { app, ipcMain } from 'electron';

import { IApplication } from './app';

import { IServerFactory, JupyterServer } from './server';

import { ArrayExt } from '@lumino/algorithm';

import { IService } from './main';

import { IRegistry } from './registry';

import { EventEmitter } from 'events';

import * as fs from 'fs';
import * as path from 'path';
import { MainWindow } from './mainwindow/mainwindow';
import { LabView } from './labview/labview';
import { appData, SessionConfig } from './settings';

export interface ISessions extends EventEmitter {
  createSession: (config: SessionConfig) => Promise<void>;

  isAppFocused: () => boolean;

  length: number;
}

export class SessionManager extends EventEmitter implements ISessions {
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

    this._registerListeners();

    app.getServerInfo().then(serverInfo => {
      const sessionConfig = appData.getSessionConfig();
      if (serverInfo.type === 'local') {
        if (this._registry.getCurrentPythonEnvironment()) {
          this.createSession(sessionConfig).then(() => {
            this._startingSession = null;
          });
        }
      } else {
        this.createSession(sessionConfig).then(() => {
          this._startingSession = null;
        });
      }
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

  createSession(config: SessionConfig): Promise<void> {
    return this._createSession(config);
  }

  setFocusedSession(session: JupyterLabSession): void {
    this._lastFocusedSession = session;
  }

  get lastFocusedSession(): JupyterLabSession | null {
    return this._lastFocusedSession;
  }

  get app(): IApplication {
    return this._app;
  }

  private _createSession(config: SessionConfig): Promise<void> {
    this._startingSession = new Promise<void>(resolve => {
      // pre launch a local server to improve load time
      if (!config.isRemote) {
        this._serverFactory.createFreeServer({} as JupyterServer.IOptions);
      }

      let session = new JupyterLabSession(this, config);

      // Register dialog on window close
      session.browserWindow.on('close', (event: Event) => {
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
        const sessionConfig = appData.getSessionConfig();
        this.createSession(sessionConfig).then(() => {
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
      const sessionConfig = appData.getSessionConfig();
      if (sessionConfig.isRemote) {
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
      if (session && !session.config.isRemote) {
        session.browserWindow.focus();
        session.browserWindow.restore();
        resolve();
      } else {
        const sessionConfig = SessionConfig.createLocal();
        appData.setSessionConfig(sessionConfig);
        this.createSession(sessionConfig).then(() => {
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
        session.labView.openFile(path);
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

  private _serverFactory: IServerFactory;

  private _registry: IRegistry;

  private _app: IApplication;
}

export class JupyterLabSession {
  constructor(sessionManager: SessionManager, config: SessionConfig) {
    this._sessionManager = sessionManager;
    this._sessionConfig = config;

    this._window = new MainWindow(config);

    this._window.window.on('focus', () => {
      this._sessionManager.setFocusedSession(this);
    });

    sessionManager.app.pageConfigSet.then(() => {
      this._window.load();
    });
  }

  get browserWindow(): Electron.BrowserWindow {
    return this._window.window;
  }

  get labView(): LabView {
    return this._window.labView;
  }

  get config(): SessionConfig {
    return this._sessionConfig;
  }

  private _sessionManager: SessionManager = null;
  private _sessionConfig: SessionConfig;
  private _window: MainWindow = null;
}

let sessions: SessionManager;
const sessionConfig = appData.getSessionConfig();

/**
 * The "open-file" listener should be registered before
 * app ready for "double click" files to open in application
 */
if (process && process.type !== 'renderer' && !sessionConfig.isRemote) {
  app.once('will-finish-launching', (e: Electron.Event) => {
    app.on('open-file', (event: Electron.Event, path: string) => {
      ipcMain.once('lab-ui-ready', (event: Electron.Event) => {
        if (sessions?.lastFocusedSession) {
          sessions.lastFocusedSession.labView.openFile(path);
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
    sessions = new SessionManager(app, serverFactory, registry);
    return sessions;
  },
  autostart: true
};
export default service;
