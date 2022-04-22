// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

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
import * as ejs from 'ejs';
import * as path from 'path';
import * as fs from 'fs';
import { getAppDir, getUserDataDir } from './utils';
import { execFile } from 'child_process';
import { loadingAnimation } from '../assets/svg';

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
      pythonPath: '',
      condaRootPath: ''
    };

    this.registerStatefulService(this).then(
      (state: JupyterApplication.IState) => {
        if (state) {
          this._applicationState = state;
          if (this._applicationState.pythonPath === undefined) {
            this._applicationState.pythonPath = '';
          }
        }

        const bundledPythonPath = this._registry.getBundledPythonPath();
        let pythonPath = this._applicationState.pythonPath;
        if (pythonPath === '') {
          pythonPath = bundledPythonPath;
        }

        const useBundledPythonPath = pythonPath === bundledPythonPath;

        if (this._registry.validatePythonEnvironmentAtPath(pythonPath)) {
          this._registry.setDefaultPythonPath(pythonPath);
          this._applicationState.pythonPath = pythonPath;
        } else {
          this._showPythonSelectorDialog(
            useBundledPythonPath ? 'invalid-bundled-env' : 'invalid-env'
          );
        }

        if (
          process.platform !== 'darwin' &&
          this._applicationState.checkForUpdatesAutomatically
        ) {
          setTimeout(() => {
            this._checkForUpdates('on-new-version');
          }, 5000);
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

  /**
   * Register all application event listeners
   */
  private _registerListeners(): void {
    // On OS X it is common for applications and their menu bar to stay
    // active until the user quits explicitly with Cmd + Q.
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

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
          cancelId: 0
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
      this._applicationState.pythonPath = path;
      app.relaunch();
      app.quit();
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
        this._showPythonSelectorDialog('change');
        return Promise.resolve();
      }
    );
  }

  private _showUpdateDialog(
    type: 'updates-available' | 'error' | 'no-updates'
  ) {
    const dialog = new BrowserWindow({
      title: 'JupyterLab Update',
      width: 400,
      height: 150,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    dialog.setMenuBarVisibility(false);

    const checkForUpdatesAutomatically =
      this._applicationState.checkForUpdatesAutomatically !== false;
    const message =
      type === 'error'
        ? 'Error occurred while checking for updates!'
        : type === 'no-updates'
        ? 'There are no updates available.'
        : `There is a new version available. Download the latest version from <a href="javascript:void(0)" onclick='handleReleasesLink(this);'>the Releases page</a>.`;

    const template = `
            <body style="background: rgba(238,238,238,1); font-size: 13px; font-family: Helvetica, Arial, sans-serif">
            <div style="height: 100%; display: flex;flex-direction: column; justify-content: space-between;">
                <div>
                <%- message %>
                </div>
                <div>
                    <label><input type='checkbox' <%= checkForUpdatesAutomatically ? 'checked' : '' %> onclick='handleAutoCheckForUpdates(this);'>Check for updates automatically</label>
                </div>
            </div>

            <script>
                const ipcRenderer = require('electron').ipcRenderer;

                function handleAutoCheckForUpdates(el) {
                    ipcRenderer.send('set-check-for-updates-automatically', el.checked);
                }

                function handleReleasesLink(el) {
                    ipcRenderer.send('launch-installer-download-page');
                }
            </script>
            </body>
        `;
    const pageSource = ejs.render(template, {
      message,
      checkForUpdatesAutomatically
    });
    dialog.loadURL(`data:text/html;charset=utf-8,${pageSource}`);
  }

  private _showPythonSelectorDialog(
    reason: 'change' | 'invalid-bundled-env' | 'invalid-env' = 'change'
  ) {
    const dialog = new BrowserWindow({
      title: 'Set Python Environment',
      width: 600,
      height: 280,
      resizable: false,
      parent: this._window,
      modal: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    dialog.setMenuBarVisibility(false);

    const bundledPythonPath = this._registry.getBundledPythonPath();
    const pythonPath = this._applicationState.pythonPath;
    let checkBundledPythonPath = false;
    if (
      reason === 'invalid-bundled-env' ||
      pythonPath === '' ||
      pythonPath === bundledPythonPath
    ) {
      checkBundledPythonPath = true;
    }
    const configuredPath = pythonPath === '' ? bundledPythonPath : pythonPath;
    const requirements = this._registry.getRequirements();
    const reqVersions = requirements.map(
      req => `${req.name} ${req.versionRange.format()}`
    );
    const reqList = reqVersions.join(', ');

    const message =
      reason === 'change'
        ? `Select the Python executable in the conda or virtualenv environment you would like to use for JupyterLab Desktop. Python packages in the environment selected need to meet the following requirements: ${reqList}. Prebuilt extensions installed in the selected environment will also be available in JupyterLab Desktop.`
        : ejs.render(
            `Failed to find a compatible Python environment at the configured path "<%= configuredPath %>". Environment Python package requirements are: ${reqList}.`,
            { configuredPath }
          );

    const template = `
            <html>
            <body style="background: rgba(238,238,238,1); font-size: 13px; font-family: Helvetica, Arial, sans-serif; padding: 20px;">
            <style>
              .row {display: flex; margin-bottom: 10px;}
              .progress-message {margin-right: 5px; line-height: 24px; visibility: hidden;}
              .progress-animation {margin-right: 5px; visibility: hidden;}
            </style>
            <div style="height: 100%; display: flex;flex-direction: column; justify-content: space-between;">
                <div class="row">
                    <b>Set Python Environment</b>
                </div>
                <div class="row">
                    ${message}
                </div>
                <div>
                    <% if (reason === 'invalid-bundled-env') { %>
                      <div class="row">
                          <input type="radio" id="install-new" name="env_type" value="install-new" checked %> onchange="handleEnvTypeChange(this);">
                          <label for="install-new">Install Python environment using the bundled installer</label>
                      </div>
                    <% } else { %>
                      <div class="row">
                          <input type="radio" id="bundled" name="env_type" value="bundled" <%= checkBundledPythonPath ? 'checked' : '' %> onchange="handleEnvTypeChange(this);">
                          <label for="bundled">Use the bundled Python environment</label>
                      </div>
                    <% } %>
                    <div class="row">
                        <input type="radio" id="custom" name="env_type" value="custom" <%= !checkBundledPythonPath ? 'checked' : '' %> onchange="handleEnvTypeChange(this);">
                        <label for="custom">Use a custom Python environment</label>
                    </div>

                    <div class="row">
                        <div style="flex-grow: 1;">
                            <input type="text" id="python-path" value="<%= pythonPath %>" readonly style="width: 100%;"></input>
                        </div>
                        <div>
                            <button id='select-python-path' onclick='handleSelectPythonPath(this);'>Select Python path</button>
                        </div>
                    </div>
                    <div class="row" style="justify-content: flex-end;">
                      <div id="progress-message" class="progress-message"></div>  
                      <div id="progress-animation" class="progress-animation">${loadingAnimation}</div>
                      <button id="apply" onclick='handleApply(this);' style='margin-right: 5px;'>Apply and restart</button>
                      <button id="cancel" onclick='handleCancel(this);'>Cancel</button>
                    </div>
                </div>
            </div>

            <script>
                const ipcRenderer = require('electron').ipcRenderer;
                let pythonPath = '';
                const installNewRadio = document.getElementById('install-new');
                const bundledRadio = document.getElementById('bundled');
                const pythonPathInput = document.getElementById('python-path');
                const selectPythonPathButton = document.getElementById('select-python-path');
                const applyButton = document.getElementById('apply');
                const cancelButton = document.getElementById('cancel');
                const progressMessage = document.getElementById('progress-message');
                const progressAnimation = document.getElementById('progress-animation');

                function handleSelectPythonPath(el) {
                    ipcRenderer.send('select-python-path');
                }
                function handleEnvTypeChange() {
                    const installNewOrUseBundled = (installNewRadio && installNewRadio.checked) || (bundledRadio && bundledRadio.checked);
                    pythonPathInput.disabled = installNewOrUseBundled;
                    selectPythonPathButton.disabled = installNewOrUseBundled;
                }

                function showProgress(message, animate) {
                  progressMessage.innerText = message;
                  progressMessage.style.visibility = message !== '' ? 'visible' : 'hidden';
                  progressAnimation.style.visibility = animate ? 'visible' : 'hidden';
                }

                function handleApply(el) {
                    if (installNewRadio && installNewRadio.checked) {
                      ipcRenderer.send('install-bundled-python-env');
                      showProgress('Installing environment', true);
                      applyButton.disabled = true;
                      cancelButton.disabled = true;
                    } else if (bundledRadio && bundledRadio.checked) {
                      ipcRenderer.send('set-python-path', '');
                    } else {
                      ipcRenderer.invoke('validate-python-path', pythonPathInput.value).then((valid) => {
                      if (valid) {
                          ipcRenderer.send('set-python-path', pythonPathInput.value);
                      } else {
                          ipcRenderer.send('show-invalid-python-path-message', pythonPathInput.value);
                      }
                    });
                  }
                }

                function handleCancel(el) {
                    window.close();
                }

                ipcRenderer.on('custom-python-path-selected', (event, path) => {
                    pythonPathInput.value = path;
                });

                ipcRenderer.on('install-bundled-python-env-result', (event, result) => {
                  const message = result === 'CANCELLED' ?
                    'Installation cancelled!' :
                    result === 'FAILURE' ?
                      'Failed to install the environment!' : '';
                  showProgress(message, false);
                  const disableButtons = result === 'SUCCESS';
                  applyButton.disabled = disableButtons;
                  cancelButton.disabled = disableButtons;
                });

                handleEnvTypeChange();
            </script>
            </body>
            </html>
        `;
    const pageSource = ejs.render(template, {
      reason,
      checkBundledPythonPath,
      pythonPath
    });
    dialog.loadURL(`data:text/html;charset=utf-8,${pageSource}`);
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
}

export namespace JupyterApplication {
  export const APP_STATE_NAMESPACE = 'jupyterlab-desktop';

  export interface IState extends JSONObject {
    checkForUpdatesAutomatically?: boolean;
    pythonPath?: string;
    condaRootPath?: string;
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
