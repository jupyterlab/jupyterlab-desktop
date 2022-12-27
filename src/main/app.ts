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
  session,
  shell
} from 'electron';

import log from 'electron-log';

import { IPythonEnvironment } from './tokens';
import { IRegistry } from './registry';
import fetch from 'node-fetch';
import * as yaml from 'js-yaml';
import * as semver from 'semver';
import * as path from 'path';
import * as fs from 'fs';

import { clearSession, getAppDir, getUserDataDir, isDarkTheme } from './utils';
import { execFile } from 'child_process';
import { JupyterServer } from './server';
import { connectAndGetServerInfo, IJupyterServerInfo } from './connect';
import { UpdateDialog } from './updatedialog/updatedialog';
import { PreferencesDialog } from './preferencesdialog/preferencesdialog';
import { ServerConfigDialog } from './serverconfigdialog/serverconfigdialog';
import { AboutDialog } from './aboutdialog/aboutdialog';
import { appData, SettingType, userSettings } from './settings';

export interface IApplication {
  registerClosingService: (service: IClosingService) => void;
  getPythonEnvironment(): Promise<IPythonEnvironment>;
  getServerInfo(): Promise<JupyterServer.IInfo>;
  pageConfigSet: Promise<boolean>;
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

export class JupyterApplication implements IApplication {
  readonly id = 'JupyterLabDesktop';
  private _registry: IRegistry;

  /**
   * Construct the Jupyter application
   */
  constructor(registry: IRegistry) {
    this._registry = registry;
    this._registerListeners();

    const sessionConfig = appData.getSessionConfig();

    const bundledPythonPath = this._registry.getBundledPythonPath();
    let pythonPath = sessionConfig.pythonPath;
    if (pythonPath === '') {
      pythonPath = bundledPythonPath;
    }

    if (sessionConfig.remoteURL === '') {
      const useBundledPythonPath = pythonPath === bundledPythonPath;

      if (this._registry.validatePythonEnvironmentAtPath(pythonPath)) {
        this._registry.setDefaultPythonPath(pythonPath);
        sessionConfig.pythonPath = pythonPath;
      } else {
        this._showServerConfigDialog(
          useBundledPythonPath ? 'invalid-bundled-env' : 'invalid-env'
        );
      }
    }

    if (
      userSettings.getValue(SettingType.checkForUpdatesAutomatically) !== false
    ) {
      let checkDirectly = true;
      if (
        process.platform === 'darwin' &&
        userSettings.getValue(SettingType.installUpdatesAutomatically) !== false
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
  }

  getPythonEnvironment(): Promise<IPythonEnvironment> {
    return new Promise<IPythonEnvironment>((resolve, _reject) => {
      resolve(this._registry.getCurrentPythonEnvironment());
    });
  }

  getServerInfo(): Promise<JupyterServer.IInfo> {
    return new Promise<JupyterServer.IInfo>(resolve => {
      const resolveInfo = () => {
        const sessionConfig = appData.getSessionConfig();
        resolve({
          type: sessionConfig.isRemote ? 'remote' : 'local',
          url: sessionConfig.url,
          port: parseInt(sessionConfig.url.port),
          token: sessionConfig.token,
          workingDirectory: sessionConfig.resolvedWorkingDirectory,
          environment: undefined,
          pageConfig: sessionConfig.pageConfig
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

  registerClosingService(service: IClosingService): void {
    this._closing.push(service);
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
      appData.save();
      userSettings.save();

      this._quit();
    });

    app.on('browser-window-focus', (_event: Event, window: BrowserWindow) => {
      this._window = window;
    });

    ipcMain.on('set-check-for-updates-automatically', (_event, autoUpdate) => {
      userSettings.setValue(
        SettingType.checkForUpdatesAutomatically,
        autoUpdate
      );
    });

    ipcMain.on('set-install-updates-automatically', (_event, install) => {
      userSettings.setValue(SettingType.installUpdatesAutomatically, install);
    });

    ipcMain.on('launch-installer-download-page', () => {
      shell.openExternal(
        'https://github.com/jupyterlab/jupyterlab-desktop/releases'
      );
    });

    ipcMain.on('launch-about-jupyter-page', () => {
      shell.openExternal('https://jupyter.org/about.html');
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

    ipcMain.handle('get-server-info', event => {
      return this.getServerInfo();
    });

    ipcMain.handle('get-current-python-environment', event => {
      return this.getPythonEnvironment();
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
      appData.getSessionConfig().remoteURL = '';
      appData.getSessionConfig().pythonPath = path;
      app.relaunch();
      app.quit();
    });

    ipcMain.on('set-remote-server-url', (event, url, persistSessionData) => {
      if (appData.getSessionConfig().remoteURL !== url) {
        appData.getSessionConfig().clearSessionDataOnNextLaunch = true;
      }

      appData.getSessionConfig().remoteURL = url;
      appData.getSessionConfig().persistSessionData = persistSessionData;
      app.relaunch();
      app.quit();
    });

    ipcMain.on('set-theme', (_event, theme) => {
      userSettings.setValue(SettingType.theme, theme);
    });

    ipcMain.on('set-sync-jupyterlab-theme', (_event, sync) => {
      userSettings.setValue(SettingType.syncJupyterLabTheme, sync);
    });

    ipcMain.on('set-frontend-mode', (_event, mode) => {
      userSettings.setValue(SettingType.frontEndMode, mode);
    });

    ipcMain.on('restart-app', _event => {
      app.relaunch();
      app.quit();
    });

    ipcMain.on('check-for-updates', _event => {
      this._checkForUpdates('always');
    });

    ipcMain.on('show-app-context-menu', event => {
      const template: MenuItemConstructorOptions[] = [
        {
          label: 'Preferences',
          click: () => {
            this._showPreferencesDialog();
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
        {
          label: 'About',
          click: () => {
            this._showAboutDialog();
          }
        }
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

    ipcMain.on('minimize-window', event => {
      const window = BrowserWindow.fromWebContents(event.sender);
      window.minimize();
    });

    ipcMain.on('maximize-window', event => {
      const window = BrowserWindow.fromWebContents(event.sender);
      window.maximize();
    });

    ipcMain.on('restore-window', event => {
      const window = BrowserWindow.fromWebContents(event.sender);
      window.unmaximize();
    });

    ipcMain.handle('is-dark-theme', event => {
      return isDarkTheme(userSettings.getValue(SettingType.theme));
    });

    ipcMain.on('show-server-config-dialog', event => {
      this._showServerConfigDialog();
    });
  }

  private _showUpdateDialog(
    type: 'updates-available' | 'error' | 'no-updates'
  ) {
    const dialog = new UpdateDialog({ type });

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

    const sessionConfig = appData.getSessionConfig();

    const dialog = new ServerConfigDialog({
      reason,
      bundledPythonPath: this._registry.getBundledPythonPath(),
      pythonPath: sessionConfig.pythonPath,
      remoteURL: sessionConfig.remoteURL,
      persistSessionData: sessionConfig.persistSessionData,
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
    this._window.getBrowserViews().forEach(view => {
      view.webContents.openDevTools();
    });
  }

  private _showPreferencesDialog() {
    if (this._preferencesDialog) {
      this._preferencesDialog.window.focus();
      return;
    }

    const dialog = new PreferencesDialog({
      theme: userSettings.getValue(SettingType.theme),
      syncJupyterLabTheme: userSettings.getValue(
        SettingType.syncJupyterLabTheme
      ),
      frontEndMode: userSettings.getValue(SettingType.frontEndMode),
      checkForUpdatesAutomatically: userSettings.getValue(
        SettingType.checkForUpdatesAutomatically
      ),
      installUpdatesAutomatically: userSettings.getValue(
        SettingType.installUpdatesAutomatically
      )
    });

    this._preferencesDialog = dialog;

    dialog.window.on('close', () => {
      this._preferencesDialog = null;
    });

    dialog.load();
  }

  private _showAboutDialog() {
    const dialog = new AboutDialog();
    dialog.load();
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

  private _closing: IClosingService[] = [];

  /**
   * The most recently focused window
   */
  private _window: Electron.BrowserWindow;
  private _serverInfoStateSet = false;
  private _serverPageConfigSet = false;
  private _serverConfigDialog: ServerConfigDialog;
  private _preferencesDialog: PreferencesDialog;
}
