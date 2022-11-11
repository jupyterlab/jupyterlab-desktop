// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  app,
  autoUpdater,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MenuItemConstructorOptions,
  nativeTheme,
  session,
  shell
} from 'electron';

import { IService } from './main';

import { ElectronStateDB } from './state';

import { JSONObject, JSONValue } from '@lumino/coreutils';

import log from 'electron-log';

import { AsyncRemote, asyncRemoteMain } from '../asyncremote';
import { IPythonEnvironment } from './tokens';
import { IRegistry } from './registry';
import fetch from 'node-fetch';
import * as yaml from 'js-yaml';
import * as semver from 'semver';
import * as path from 'path';
import * as fs from 'fs';
import { AddressInfo, createServer } from 'net';
import { randomBytes } from 'crypto';

import { appConfig, clearSession, getAppDir, getUserDataDir } from './utils';
import { execFile } from 'child_process';
import { IServerFactory, JupyterServer, waitUntilServerIsUp } from './server';
import { connectAndGetServerInfo, IJupyterServerInfo } from './connect';
import { UpdateDialog } from './updatedialog/updatedialog';
import { PreferencesDialog } from './preferencesdialog/preferencesdialog';
import { ServerConfigDialog } from './serverconfigdialog/serverconfigdialog';

async function getFreePort(): Promise<number> {
  return new Promise<number>(resolve => {
    const getPort = () => {
      const server = createServer(socket => {
        socket.write('Echo server\r\n');
        socket.pipe(socket);
      });

      server.on('error', function (e) {
        getPort();
      });
      server.on('listening', function (e: any) {
        const port = (server.address() as AddressInfo).port;
        server.close();

        resolve(port);
      });

      server.listen(0, '127.0.0.1');
    };

    getPort();
  });
}

export interface IApplication {
  /**
   * Register as service with persistent state.
   *
   * @return promise fulfileld with the service's previous state.
   */
  registerStatefulService: (service: IStatefulService) => Promise<JSONValue>;

  registerClosingService: (service: IClosingService) => void;

  /**
   * Force the application service to write data to the disk.
   */
  saveState: (service: IStatefulService, data: JSONValue) => Promise<void>;

  getPythonEnvironment(): Promise<IPythonEnvironment>;

  setCondaRootPath(condaRootPath: string): void;

  getCondaRootPath(): Promise<string>;

  getServerInfo(): Promise<JupyterServer.IInfo>;
  pageConfigSet: Promise<boolean>;
}

/**
 * A service that has data that needs to persist.
 */
export interface IStatefulService {
  /**
   * The human-readable id for the service state. Must be unique
   * to each service.
   */
  id: string;

  /**
   * Called before the application quits. Qutting will
   * be suspended until the returned promise is resolved with
   * the service's state.
   *
   * @return promise that is fulfilled with the service's state.
   */
  getStateBeforeQuit(): Promise<JSONValue>;

  /**
   * Called before state is passed to the service. Implementing
   * services should scan the state for issues in this function.
   * If the data is invalid, the function should return false.
   *
   * @return true if the data is valid, false otherwise.
   */
  verifyState: (state: JSONValue) => boolean;
}

/**
 * A service that has to complete some task on application exit
 */
export interface IClosingService {
  /**
   * Called before the application exits and after the states are saved.
   * Service resolves the promise upon a successful cleanup.
   *
   * @return promise that is fulfilled when the service is ready to quit
   */
  finished(): Promise<void>;
}

export namespace IAppRemoteInterface {
  export let checkForUpdates: AsyncRemote.IMethod<void, void> = {
    id: 'JupyterLabDesktop-check-for-updates'
  };
  export let openDevTools: AsyncRemote.IMethod<void, void> = {
    id: 'JupyterLabDesktop-open-dev-tools'
  };
  export let getCurrentPythonEnvironment: AsyncRemote.IMethod<
    void,
    IPythonEnvironment
  > = {
    id: 'JupyterLabDesktop-get-python-env'
  };
  export let getCurrentRootPath: AsyncRemote.IMethod<void, string> = {
    id: 'JupyterLabDesktop-get-current-path'
  };
  export let showPythonPathSelector: AsyncRemote.IMethod<void, void> = {
    id: 'JupyterLabDesktop-select-python-path'
  };
}

export class JupyterApplication implements IApplication, IStatefulService {
  readonly id = 'JupyterLabDesktop';
  private _registry: IRegistry;

  /**
   * Construct the Jupyter application
   */
  constructor(registry: IRegistry) {
    this._registry = registry;
    this._registerListeners();

    // Get application state from state db file.
    this._appState = new Promise<JSONObject>((res, rej) => {
      this._appStateDB
        .fetch(JupyterApplication.APP_STATE_NAMESPACE)
        .then((state: JSONObject) => {
          res(state);
        })
        .catch(e => {
          log.error(e);
          res({});
        });
    });

    this._applicationState = {
      checkForUpdatesAutomatically: true,
      installUpdatesAutomatically: true,
      pythonPath: '',
      condaRootPath: '',
      remoteURL: ''
    };

    this.registerStatefulService(this).then(
      (state: JupyterApplication.IState) => {
        if (state) {
          this._applicationState = state;
        }

        const appState = this._applicationState;

        if (appState.remoteURL === undefined) {
          appState.remoteURL = '';
        }

        if (appState.persistSessionData === undefined) {
          appState.persistSessionData = true;
        }

        if (appState.pythonPath === undefined) {
          appState.pythonPath = '';
        }
        const bundledPythonPath = this._registry.getBundledPythonPath();
        let pythonPath = appState.pythonPath;
        if (pythonPath === '') {
          pythonPath = bundledPythonPath;
        }

        if (appState.remoteURL === '') {
          const useBundledPythonPath = pythonPath === bundledPythonPath;

          if (this._registry.validatePythonEnvironmentAtPath(pythonPath)) {
            this._registry.setDefaultPythonPath(pythonPath);
            appState.pythonPath = pythonPath;
          } else {
            this._showServerConfigDialog(
              useBundledPythonPath ? 'invalid-bundled-env' : 'invalid-env'
            );
          }
        }

        if (appState.checkForUpdatesAutomatically !== false) {
          let checkDirectly = true;
          if (
            process.platform === 'darwin' &&
            appState.installUpdatesAutomatically !== false
          ) {
            this._setupAutoUpdater();
            checkDirectly = false;
          }

          if (checkDirectly) {
            setTimeout(() => {
              this._checkForUpdates('on-new-version');
            }, 5000);
          }
        }

        if (appState.remoteURL === '') {
          appConfig.isRemote = false;
          getFreePort().then(port => {
            appConfig.token = randomBytes(24).toString('hex');
            appConfig.url = new URL(
              `http://localhost:${port}/lab?token=${appConfig.token}`
            );
            this._serverInfoStateSet = true;

            waitUntilServerIsUp(appConfig.url).then(() => {
              connectAndGetServerInfo(appConfig.url.href, { showDialog: false })
                .then(serverInfo => {
                  appConfig.pageConfig = serverInfo.pageConfig;
                  appConfig.cookies = serverInfo.cookies;
                  this._serverPageConfigSet = true;
                })
                .catch(() => {
                  this._showServerConfigDialog('change');
                });
            });
          });
        } else {
          appConfig.isRemote = true;
          appConfig.persistSessionData = appState.persistSessionData;
          appConfig.clearSessionDataOnNextLaunch =
            appState.clearSessionDataOnNextLaunch === true;
          // reset the flag
          appState.clearSessionDataOnNextLaunch = false;
          try {
            appConfig.url = new URL(appState.remoteURL);
            appConfig.token = appConfig.url.searchParams.get('token');
            connectAndGetServerInfo(appConfig.url.href, { showDialog: true })
              .then(serverInfo => {
                appConfig.pageConfig = serverInfo.pageConfig;
                appConfig.cookies = serverInfo.cookies;
                this._serverInfoStateSet = true;
                this._serverPageConfigSet = true;
              })
              .catch(() => {
                this._showServerConfigDialog('remote-connection-failure');
              });
          } catch (error) {
            this._showServerConfigDialog('remote-connection-failure');
          }
        }
      }
    );
  }

  getPythonEnvironment(): Promise<IPythonEnvironment> {
    return new Promise<IPythonEnvironment>((resolve, _reject) => {
      this._appState.then((state: JSONObject) => {
        resolve(this._registry.getCurrentPythonEnvironment());
      });
    });
  }

  setCondaRootPath(condaRootPath: string): void {
    this._applicationState.condaRootPath = condaRootPath;
  }

  getCondaRootPath(): Promise<string> {
    return new Promise<string>((resolve, _reject) => {
      this._appState.then((state: JSONObject) => {
        resolve(this._applicationState.condaRootPath);
      });
    });
  }

  getServerInfo(): Promise<JupyterServer.IInfo> {
    return new Promise<JupyterServer.IInfo>(resolve => {
      const resolveInfo = () => {
        resolve({
          type: appConfig.isRemote ? 'remote' : 'local',
          url: `${appConfig.url.protocol}//${appConfig.url.host}${appConfig.url.pathname}`,
          token: appConfig.token,
          environment: undefined,
          pageConfig: appConfig.pageConfig
        });
      };

      if (this._serverInfoStateSet) {
        resolveInfo();
        return;
      }

      const timer = setInterval(() => {
        if (this._serverInfoStateSet) {
          clearInterval(timer);
          resolveInfo();
        }
      }, 200);
    });
  }

  get pageConfigSet(): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      if (this._serverPageConfigSet) {
        resolve(true);
        return;
      }

      const timer = setInterval(() => {
        if (this._serverPageConfigSet) {
          clearInterval(timer);
          resolve(true);
        }
      }, 200);
    });
  }

  registerStatefulService(service: IStatefulService): Promise<JSONValue> {
    this._services.push(service);

    return new Promise<JSONValue>((res, rej) => {
      this._appState
        .then((state: JSONObject) => {
          if (
            state &&
            state[service.id] &&
            service.verifyState(state[service.id])
          ) {
            res(state[service.id]);
          }
          res(null);
        })
        .catch(() => {
          res(null);
        });
    });
  }

  registerClosingService(service: IClosingService): void {
    this._closing.push(service);
  }

  saveState(service: IStatefulService, data: JSONValue): Promise<void> {
    this._updateState(service.id, data);
    return this._saveState();
  }

  getStateBeforeQuit(): Promise<JupyterApplication.IState> {
    return Promise.resolve(this._applicationState);
  }

  verifyState(state: JupyterApplication.IState): boolean {
    return true;
  }

  private _setupAutoUpdater() {
    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
      const dialogOpts = {
        type: 'info',
        buttons: ['Restart', 'Later'],
        title: 'Application Update',
        message: process.platform === 'win32' ? releaseNotes : releaseName,
        detail:
          'A new version has been downloaded. Restart the application to apply the updates.'
      };

      dialog.showMessageBox(dialogOpts).then(returnValue => {
        if (returnValue.response === 0) autoUpdater.quitAndInstall();
      });
    });

    autoUpdater.on('error', message => {
      log.error('There was a problem updating the application');
      log.error(message);
    });

    require('update-electron-app')();
  }

  private _updateState(id: string, data: JSONValue): void {
    let prevState = this._appState;

    this._appState = new Promise<JSONObject>((res, rej) => {
      prevState
        .then((state: JSONObject) => {
          state[id] = data;
          res(state);
        })
        .catch((state: JSONObject) => res(state));
    });
  }

  private _rewriteState(ids: string[], data: JSONValue[]): void {
    let prevState = this._appState;

    this._appState = new Promise<JSONObject>((res, rej) => {
      prevState
        .then(() => {
          let state: JSONObject = {};
          ids.forEach((id: string, idx: number) => {
            state[id] = data[idx];
          });
          res(state);
        })
        .catch((state: JSONObject) => res(state));
    });
  }

  private _saveState(): Promise<void> {
    return new Promise<void>((res, rej) => {
      this._appState
        .then((state: JSONObject) => {
          return this._appStateDB.save(
            JupyterApplication.APP_STATE_NAMESPACE,
            state
          );
        })
        .then(() => {
          res();
        })
        .catch(e => {
          rej(e);
        });
    });
  }

  private _validateRemoteServerUrl(url: string): Promise<IJupyterServerInfo> {
    return connectAndGetServerInfo(url, { showDialog: true, incognito: true });
  }

  private _clearSessionData(): Promise<void> {
    return clearSession(session.defaultSession);
  }

  /**
   * Register all application event listeners
   */
  private _registerListeners(): void {
    app.on('will-quit', event => {
      event.preventDefault();

      // Collect data from services
      let state: Promise<JSONValue>[] = this._services.map(
        (s: IStatefulService) => {
          return s.getStateBeforeQuit();
        }
      );
      let ids: string[] = this._services.map((s: IStatefulService) => {
        return s.id;
      });

      // Wait for all services to return state
      Promise.all(state)
        .then((data: JSONValue[]) => {
          this._rewriteState(ids, data);
          return this._saveState();
        })
        .then(() => {
          this._quit();
        })
        .catch(() => {
          log.error(new Error('JupyterLab did not save state successfully'));
          this._quit();
        });
    });

    app.on('browser-window-focus', (_event: Event, window: BrowserWindow) => {
      this._window = window;
    });

    ipcMain.on('set-check-for-updates-automatically', (_event, autoUpdate) => {
      this._applicationState.checkForUpdatesAutomatically = autoUpdate;
    });

    ipcMain.on('set-install-updates-automatically', (_event, autoUpdate) => {
      this._applicationState.installUpdatesAutomatically = autoUpdate;
    });

    ipcMain.on('launch-installer-download-page', () => {
      shell.openExternal(
        'https://github.com/jupyterlab/jupyterlab-desktop/releases'
      );
    });

    ipcMain.on('select-python-path', event => {
      const currentEnv = this._registry.getCurrentPythonEnvironment();

      dialog
        .showOpenDialog({
          properties: ['openFile', 'showHiddenFiles', 'noResolveAliases'],
          buttonLabel: 'Use Path',
          defaultPath: currentEnv ? path.dirname(currentEnv.path) : undefined
        })
        .then(({ filePaths }) => {
          if (filePaths.length > 0) {
            event.sender.send('custom-python-path-selected', filePaths[0]);
          }
        });
    });

    ipcMain.on('install-bundled-python-env', event => {
      const platform = process.platform;
      const isWin = platform === 'win32';
      const appDir = getAppDir();
      const appVersion = app.getVersion();
      const installerPath = isWin
        ? `${appDir}\\env_installer\\JupyterLabDesktopAppServer-${appVersion}-Windows-x86_64.exe`
        : platform === 'darwin'
        ? `${appDir}/env_installer/JupyterLabDesktopAppServer-${appVersion}-MacOSX-x86_64.sh`
        : `${appDir}/env_installer/JupyterLabDesktopAppServer-${appVersion}-Linux-x86_64.sh`;
      const userDataDir = getUserDataDir();
      const installPath = path.join(userDataDir, 'jlab_server');

      if (fs.existsSync(installPath)) {
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          message: 'Do you want to overwrite?',
          detail: `Install path (${installPath}) is not empty. Would you like to overwrite it?`,
          buttons: ['Overwrite', 'Cancel'],
          defaultId: 1,
          cancelId: 1
        });

        if (choice === 0) {
          fs.rmdirSync(installPath, { recursive: true });
        } else {
          event.sender.send('install-bundled-python-env-result', 'CANCELLED');
          return;
        }
      }

      const installerProc = execFile(installerPath, ['-b', '-p', installPath], {
        shell: isWin ? 'cmd.exe' : '/bin/bash',
        env: {
          ...process.env
        }
      });

      installerProc.on('exit', (exitCode: number) => {
        if (exitCode === 0) {
          event.sender.send('install-bundled-python-env-result', 'SUCCESS');
          app.relaunch();
          app.quit();
        } else {
          event.sender.send('install-bundled-python-env-result', 'FAILURE');
          log.error(new Error(`Installer Exit: ${exitCode}`));
        }
      });

      installerProc.on('error', (err: Error) => {
        event.sender.send('install-bundled-python-env-result', 'FAILURE');
        log.error(err);
      });
    });

    ipcMain.handle('validate-python-path', (event, path) => {
      return this._registry.validatePythonEnvironmentAtPath(path);
    });

    ipcMain.handle('validate-remote-server-url', (event, url) => {
      return new Promise<any>((resolve, reject) => {
        this._validateRemoteServerUrl(url)
          .then(value => {
            resolve({ result: 'valid' });
          })
          .catch(error => {
            resolve({ result: 'invalid', error: error.message });
          });
      });
    });

    ipcMain.handle('clear-session-data', event => {
      return new Promise<any>((resolve, reject) => {
        this._clearSessionData()
          .then(() => {
            resolve({ result: 'success' });
          })
          .catch(error => {
            resolve({ result: 'error', error: error.message });
          });
      });
    });

    ipcMain.on('show-invalid-python-path-message', (event, path) => {
      const requirements = this._registry.getRequirements();
      const reqVersions = requirements.map(
        req => `${req.name} ${req.versionRange.format()}`
      );
      const reqList = reqVersions.join(', ');
      const message = `Failed to find a compatible Python environment at the configured path "${path}". Environment Python package requirements are: ${reqList}.`;
      dialog.showMessageBox({ message, type: 'error' });
    });

    ipcMain.on('set-python-path', (event, path) => {
      this._applicationState.remoteURL = '';
      this._applicationState.pythonPath = path;
      app.relaunch();
      app.quit();
    });

    ipcMain.on('set-remote-server-url', (event, url, persistSessionData) => {
      if (this._applicationState.remoteURL !== url) {
        this._applicationState.clearSessionDataOnNextLaunch = true;
      }

      this._applicationState.remoteURL = url;
      this._applicationState.persistSessionData = persistSessionData;
      app.relaunch();
      app.quit();
    });

    ipcMain.on('show-app-context-menu', event => {
      const template: MenuItemConstructorOptions[] = [
        {
          label: 'Preferences',
          click: () => {
            const dialog = new PreferencesDialog({
              checkForUpdatesAutomatically:
                this._applicationState.checkForUpdatesAutomatically !== false,
              installUpdatesAutomatically:
                this._applicationState.installUpdatesAutomatically !== false
            });

            dialog.load();
          }
        },
        {
          label: 'Check for updates…',
          click: () => {
            this._checkForUpdates('always');
          }
        },
        {
          label: 'Open Developer Tools',
          click: () => {
            this._openDevTools();
          }
        },
        { type: 'separator' },
        { label: 'About' }
      ];

      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        window: BrowserWindow.fromWebContents(event.sender)
      });
    });

    ipcMain.on('close-active-window', event => {
      const window = BrowserWindow.fromWebContents(event.sender);
      window.close();
    });

    ipcMain.handle('is-dark-theme', event => {
      return nativeTheme.shouldUseDarkColors;
    });

    ipcMain.on('show-server-config-dialog', event => {
      this._showServerConfigDialog();
    });

    asyncRemoteMain.registerRemoteMethod(
      IAppRemoteInterface.checkForUpdates,
      (): Promise<void> => {
        this._checkForUpdates('always');
        return Promise.resolve();
      }
    );

    asyncRemoteMain.registerRemoteMethod(
      IAppRemoteInterface.openDevTools,
      (): Promise<void> => {
        this._window.webContents.openDevTools();
        return Promise.resolve();
      }
    );

    asyncRemoteMain.registerRemoteMethod(
      IAppRemoteInterface.getCurrentPythonEnvironment,
      (): Promise<IPythonEnvironment> => {
        return this.getPythonEnvironment();
      }
    );

    asyncRemoteMain.registerRemoteMethod(
      IAppRemoteInterface.getCurrentRootPath,
      async (): Promise<string> => {
        return process.env.JLAB_DESKTOP_HOME || app.getPath('home');
      }
    );

    asyncRemoteMain.registerRemoteMethod(
      IAppRemoteInterface.showPythonPathSelector,
      (): Promise<void> => {
        this._showServerConfigDialog('change');
        return Promise.resolve();
      }
    );

    asyncRemoteMain.registerRemoteMethod(
      IServerFactory.getServerInfo,
      (): Promise<any> => {
        return this.getServerInfo();
      }
    );
  }

  private _showUpdateDialog(
    type: 'updates-available' | 'error' | 'no-updates'
  ) {
    const dialog = new UpdateDialog({
      type,
      checkForUpdatesAutomatically:
        this._applicationState.checkForUpdatesAutomatically !== false,
      installUpdatesAutomatically:
        this._applicationState.installUpdatesAutomatically !== false
    });

    dialog.load();
  }

  private _showServerConfigDialog(
    reason:
      | 'change'
      | 'invalid-bundled-env'
      | 'invalid-env'
      | 'remote-connection-failure' = 'change'
  ) {
    if (this._serverConfigDialog) {
      this._serverConfigDialog.window.focus();
      return;
    }

    const dialog = new ServerConfigDialog({
      reason,
      bundledPythonPath: this._registry.getBundledPythonPath(),
      pythonPath: this._applicationState.pythonPath,
      remoteURL: this._applicationState.remoteURL,
      persistSessionData: this._applicationState.persistSessionData,
      envRequirements: this._registry.getRequirements()
    });

    this._serverConfigDialog = dialog;

    dialog.window.on('close', () => {
      this._serverConfigDialog = null;
    });

    dialog.load();
  }

  private _checkForUpdates(showDialog: 'on-new-version' | 'always') {
    fetch(
      'https://github.com/jupyterlab/jupyterlab-desktop/releases/latest/download/latest.yml'
    )
      .then(async response => {
        try {
          const data = await response.text();
          const latestReleaseData = yaml.load(data);
          const latestVersion = (latestReleaseData as any).version;
          const currentVersion = app.getVersion();
          const newVersionAvailable =
            semver.compare(currentVersion, latestVersion) === -1;
          if (showDialog === 'always' || newVersionAvailable) {
            this._showUpdateDialog(
              newVersionAvailable ? 'updates-available' : 'no-updates'
            );
          }
        } catch (error) {
          if (showDialog === 'always') {
            this._showUpdateDialog('error');
          }
          console.error('Failed to check for updates:', error);
        }
      })
      .catch(error => {
        if (showDialog === 'always') {
          this._showUpdateDialog('error');
        }
        console.error('Failed to check for updates:', error);
      });
  }

  private _openDevTools() {
    this._window.getBrowserViews()[0].webContents.openDevTools();
    this._window.getBrowserViews()[1].webContents.openDevTools();
  }

  private _quit(): void {
    let closing: Promise<void>[] = this._closing.map((s: IClosingService) => {
      return s.finished();
    });

    Promise.all(closing)
      .then(() => {
        process.exit();
      })
      .catch(err => {
        log.error(new Error('JupyterLab could not close successfully'));
        process.exit();
      });
  }

  private _appStateDB = new ElectronStateDB({
    namespace: 'jupyterlab-desktop-data'
  });

  private _appState: Promise<JSONObject>;

  private _applicationState: JupyterApplication.IState;

  private _services: IStatefulService[] = [];

  private _closing: IClosingService[] = [];

  /**
   * The most recently focused window
   */
  private _window: Electron.BrowserWindow;
  private _serverInfoStateSet = false;
  private _serverPageConfigSet = false;
  private _serverConfigDialog: ServerConfigDialog;
}

export namespace JupyterApplication {
  export const APP_STATE_NAMESPACE = 'jupyterlab-desktop';

  export interface IState extends JSONObject {
    checkForUpdatesAutomatically?: boolean;
    installUpdatesAutomatically?: boolean;
    pythonPath?: string;
    condaRootPath?: string;
    remoteURL?: string;
    persistSessionData?: boolean;
    clearSessionDataOnNextLaunch?: boolean;
  }
}

let service: IService = {
  requirements: ['IRegistry'],
  provides: 'IApplication',
  activate: (registry: IRegistry): IApplication => {
    return new JupyterApplication(registry);
  }
};
export default service;
