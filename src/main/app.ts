// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  app,
  autoUpdater,
  BrowserWindow,
  dialog,
  session,
  shell
} from 'electron';
import log from 'electron-log';
import { IRegistry, Registry } from './registry';
import fetch from 'node-fetch';
import * as yaml from 'js-yaml';
import * as semver from 'semver';
import * as fs from 'fs';
import {
  clearSession,
  EnvironmentInstallStatus,
  getBundledPythonEnvPath,
  getBundledPythonPath,
  getNextPythonEnvName,
  getPythonEnvsDirectory,
  installBundledEnvironment,
  isDarkTheme,
  waitForDuration
} from './utils';
import { IServerFactory, JupyterServerFactory } from './server';
import { connectAndGetServerInfo, IJupyterServerInfo } from './connect';
import { UpdateDialog } from './updatedialog/updatedialog';
import {
  CtrlWBehavior,
  DEFAULT_WIN_HEIGHT,
  DEFAULT_WIN_WIDTH,
  LogLevel,
  resolveWorkingDirectory,
  SettingType,
  StartupMode,
  userSettings
} from './config/settings';
import {
  ContentViewType,
  IServerInfo,
  SessionWindow
} from './sessionwindow/sessionwindow';
import { appData } from './config/appdata';
import { ICLIArguments, IDisposable, IRect } from './tokens';
import { SessionConfig } from './config/sessionconfig';
import { AsyncEventHandlerMain, EventManager } from './eventmanager';
import { EventTypeMain, EventTypeRenderer } from './eventtypes';
import { SettingsDialog } from './settingsdialog/settingsdialog';
import { AboutDialog } from './aboutdialog/aboutdialog';
import { AuthDialog } from './authdialog/authdialog';
import { ManagePythonEnvironmentDialog } from './pythonenvdialog/pythonenvdialog';
import { addUserSetEnvironment, createPythonEnvironment } from './cli';

export interface IApplication {
  createNewEmptySession(): void;
  createFreeServersIfNeeded(): void;
  checkForUpdates(showDialog: 'on-new-version' | 'always'): void;
  showSettingsDialog(activateTab?: SettingsDialog.Tab): void;
  showManagePythonEnvsDialog(): void;
  showAboutDialog(): void;
  cliArgs: ICLIArguments;
}

interface IClearHistoryOptions {
  sessionData: boolean;
  recentRemoteURLs: boolean;
  recentSessions: boolean;
  userSetPythonEnvs: boolean;
}

const minimumWindowSpacing = 15;
const windowSpacing = 30;

class SessionWindowManager implements IDisposable {
  constructor(options: SessionWindowManager.IOptions) {
    this._options = options;
  }

  createNewEmptyWindow(): SessionWindow {
    return this.createNew(ContentViewType.Welcome);
  }

  restoreLabWindow(sessionConfig?: SessionConfig): SessionWindow {
    return this.createNew(ContentViewType.Lab, sessionConfig, true);
  }

  createNewLabWindow(sessionConfig?: SessionConfig): SessionWindow {
    return this.createNew(ContentViewType.Lab, sessionConfig);
  }

  getOrCreateEmptyWindow(): SessionWindow {
    const emptySessionWindow = this._windows.find(sessionWindow => {
      return sessionWindow.contentViewType === ContentViewType.Welcome;
    });

    if (emptySessionWindow) {
      return emptySessionWindow;
    }

    return this.createNewEmptyWindow();
  }

  getEmptyWindowCount(): number {
    let count = 0;

    this._windows.forEach(sessionWindow => {
      if (sessionWindow.contentViewType === ContentViewType.Welcome) {
        count++;
      }
    });

    return count;
  }

  private _getNewWindowRect(): IRect {
    // cannot require the screen module until the app is ready, so require here
    const { screen } = require('electron');
    const cursorPt = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPt);
    const {
      x: screenX,
      y: screenY,
      width: screenWidth,
      height: screenHeight
    } = display.bounds;
    const width = DEFAULT_WIN_WIDTH;
    const height = DEFAULT_WIN_HEIGHT;
    const x = screenX + Math.round((screenWidth - width) / 2);
    const y = screenY + Math.round((screenHeight - height) / 2);

    return { x, y, width, height };
  }

  private _isRectTooCloseToExistingWindows(rect: IRect): boolean {
    for (const sessionWindow of this._windows) {
      const winBounds = sessionWindow.window.getBounds();
      if (
        Math.abs(winBounds.x - rect.x) < minimumWindowSpacing ||
        Math.abs(winBounds.y - rect.y) < minimumWindowSpacing
      ) {
        return true;
      }
    }

    return false;
  }

  createNew(
    contentView?: ContentViewType,
    sessionConfig?: SessionConfig,
    restorePosition?: boolean
  ): SessionWindow {
    let rect: IRect;

    if (!restorePosition) {
      rect = this._getNewWindowRect();

      // if any other window has top left too close to the new,
      // move the new window rect
      while (this._isRectTooCloseToExistingWindows(rect)) {
        rect.x += windowSpacing;
        rect.y += windowSpacing;
      }
    }

    const window = new SessionWindow({
      app: this._options.app,
      registry: this._options.registry,
      serverFactory: this._options.serverFactory,
      contentView: contentView,
      sessionConfig,
      rect
    });
    window.load();

    this._windows.push(window);

    window.sessionConfigChanged.connect(this.syncSessionData, this);

    window.window.on('close', async event => {
      const index = this._windows.indexOf(window);
      if (index !== -1) {
        window.sessionConfigChanged.disconnect(this.syncSessionData, this);
        await window.dispose();
        this._windows.splice(index, 1);
        this.syncSessionData();

        if (this._windows.length === 0) {
          this._options.app.closeSettingsDialog();
          this._options.app.closeAboutDialog();
        }
      }
    });

    return window;
  }

  get windows(): SessionWindow[] {
    return this._windows;
  }

  syncSessionData() {
    const sessionConfigs: SessionConfig[] = [];
    this._windows.forEach(sessionWindow => {
      if (sessionWindow.contentViewType === ContentViewType.Lab) {
        sessionConfigs.push(sessionWindow.sessionConfig);
      }
    });

    appData.setActiveSessions(sessionConfigs);
  }

  dispose(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      return Promise.all([
        this._windows.map(sessionWindow => sessionWindow.dispose())
      ])
        .then(() => {
          resolve();
        })
        .catch(error => {
          console.error(
            'There was a problem shutting down the application',
            error
          );
          resolve();
        });
    });
  }

  private _options: SessionWindowManager.IOptions;
  private _windows: SessionWindow[] = [];
}

namespace SessionWindowManager {
  export interface IOptions {
    app: JupyterApplication;
    registry: IRegistry;
    serverFactory: IServerFactory;
  }
}

export class JupyterApplication implements IApplication, IDisposable {
  /**
   * Construct the Jupyter application
   */
  constructor(cliArgs: ICLIArguments) {
    this._cliArgs = cliArgs;
    this._registry = new Registry();
    this._serverFactory = new JupyterServerFactory(this._registry);

    this._sessionWindowManager = new SessionWindowManager({
      app: this,
      registry: this._registry,
      serverFactory: this._serverFactory
    });

    // create a server in advance
    this._serverFactory.createFreeServer().catch(error => {
      console.error('Failed to create free server', error);
    });
    this._registerListeners();

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
          this.checkForUpdates('on-new-version');
        }, 5000);
      }
    }

    this._isDarkTheme = isDarkTheme(userSettings.getValue(SettingType.theme));

    this.startup();
  }

  createNewEmptySession() {
    this._sessionWindowManager.createNewEmptyWindow();
  }

  createFreeServersIfNeeded() {
    const emptyWindowCount = this._sessionWindowManager.getEmptyWindowCount();
    if (emptyWindowCount > 0) {
      this._serverFactory.createFreeServersIfNeeded(
        undefined,
        emptyWindowCount
      );
    }
  }

  get cliArgs(): ICLIArguments {
    return this._cliArgs;
  }

  startup() {
    const startupMode = userSettings.getValue(
      SettingType.startupMode
    ) as StartupMode;

    // if launching from CLI, parse settings
    const sessionConfig = SessionConfig.createFromArgs(this._cliArgs);

    if (sessionConfig) {
      this._sessionWindowManager.createNewLabWindow(sessionConfig);
      return;
    }

    if (
      startupMode === StartupMode.LastSessions &&
      appData.sessions.length > 0
    ) {
      appData.sessions.forEach(sessionConfig => {
        this._sessionWindowManager.restoreLabWindow(sessionConfig);
      });
      return;
    }

    if (startupMode === StartupMode.NewLocalSession) {
      const sessionConfig = SessionConfig.createLocal();
      this._sessionWindowManager.createNewLabWindow(sessionConfig);
    } else {
      this._sessionWindowManager.createNewEmptyWindow();
    }
  }

  handleOpenFilesOrFolders(fileOrFolders?: string[]) {
    const sessionWindow = this._sessionWindowManager.getOrCreateEmptyWindow();
    sessionWindow.handleOpenFilesOrFolders(fileOrFolders);

    this.focusSession(sessionWindow);
  }

  openSession(sessionConfig: SessionConfig) {
    const sessionWindow = this._sessionWindowManager.getOrCreateEmptyWindow();
    sessionWindow.openSession(sessionConfig);

    this.focusSession(sessionWindow);
  }

  focusSession(sessionWindow: SessionWindow) {
    if (sessionWindow.window.isMinimized()) {
      sessionWindow.window.restore();
    }
    sessionWindow.window.focus();
  }

  showSettingsDialog(activateTab?: SettingsDialog.Tab) {
    if (this._settingsDialog) {
      this._settingsDialog.window.focus();
      return;
    }

    const settings = userSettings;

    const dialog = new SettingsDialog(
      {
        isDarkTheme: this._isDarkTheme,
        startupMode: settings.getValue(SettingType.startupMode),
        theme: settings.getValue(SettingType.theme),
        syncJupyterLabTheme: settings.getValue(SettingType.syncJupyterLabTheme),
        showNewsFeed: settings.getValue(SettingType.showNewsFeed),
        checkForUpdatesAutomatically: settings.getValue(
          SettingType.checkForUpdatesAutomatically
        ),
        installUpdatesAutomatically: settings.getValue(
          SettingType.installUpdatesAutomatically
        ),
        defaultWorkingDirectory: userSettings.getValue(
          SettingType.defaultWorkingDirectory
        ),
        defaultPythonPath: userSettings.getValue(SettingType.pythonPath),
        logLevel: userSettings.getValue(SettingType.logLevel),
        activateTab: activateTab,
        serverArgs: userSettings.getValue(SettingType.serverArgs),
        overrideDefaultServerArgs: userSettings.getValue(
          SettingType.overrideDefaultServerArgs
        ),
        serverEnvVars: userSettings.getValue(SettingType.serverEnvVars),
        ctrlWBehavior: userSettings.getValue(SettingType.ctrlWBehavior)
      },
      this._registry
    );

    this._settingsDialog = dialog;

    dialog.window.on('closed', () => {
      this._settingsDialog = null;
    });

    dialog.load();
  }

  async showManagePythonEnvsDialog() {
    const dialog = new ManagePythonEnvironmentDialog({
      envs: await this._registry.getEnvironmentList(false),
      isDarkTheme: this._isDarkTheme,
      defaultPythonPath: userSettings.getValue(SettingType.pythonPath),
      app: this
    });
    dialog.load();
  }

  closeSettingsDialog() {
    if (this._settingsDialog) {
      this._settingsDialog.window.close();
      this._settingsDialog = null;
    }
  }

  showAboutDialog() {
    if (this._aboutDialog) {
      this._aboutDialog.window.window.focus();
      return;
    }

    const dialog = new AboutDialog({ isDarkTheme: this._isDarkTheme });

    this._aboutDialog = dialog;

    dialog.window.window.on('closed', () => {
      this._aboutDialog = null;
    });

    this._aboutDialog.load();
  }

  closeAboutDialog() {
    if (this._aboutDialog) {
      this._aboutDialog.window.window.close();
      this._aboutDialog = null;
    }
  }

  get registry(): IRegistry {
    return this._registry;
  }

  async updateRegistry() {
    const registry = new Registry();
    await registry.ready;
    this._registry = registry;
    appData.save();
  }

  dispose(): Promise<void> {
    if (this._disposePromise) {
      return this._disposePromise;
    }

    this.closeSettingsDialog();
    this.closeAboutDialog();

    this._disposePromise = new Promise<void>((resolve, reject) => {
      Promise.all([
        this._sessionWindowManager.dispose(),
        this._serverFactory.dispose(),
        this._registry.dispose()
      ])
        .then(() => {
          resolve();
        })
        .catch(error => {
          console.error(
            'There was a problem shutting down the application',
            error
          );
          resolve();
        });
    });

    return this._disposePromise;
  }

  private _setupAutoUpdater() {
    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
      const dialogOpts: Electron.MessageBoxOptions = {
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

  private async _showAuthDialog(
    host: string,
    parent?: BrowserWindow
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const dialog = new AuthDialog({
        isDarkTheme: isDarkTheme(userSettings.getValue(SettingType.theme)),
        host,
        parent
      });

      const handler: AsyncEventHandlerMain = (_event, username, password) => {
        dialog.window.window.close();

        this._evm.unregisterEventHandler(
          EventTypeMain.SetAuthDialogResponse,
          handler
        );

        resolve({ username, password });
      };

      dialog.window.window.on('closed', () => {
        this._evm.unregisterEventHandler(
          EventTypeMain.SetAuthDialogResponse,
          handler
        );
        reject();
      });

      this._evm.registerEventHandler(
        EventTypeMain.SetAuthDialogResponse,
        handler
      );

      dialog.load();
    });
  }

  /**
   * Register all application event listeners
   */
  private _registerListeners(): void {
    app.on('login', async (event, webContents, request, authInfo, callback) => {
      if (authInfo.scheme === 'basic') {
        event.preventDefault();
        try {
          const parent = BrowserWindow.fromWebContents(webContents);
          const userInfo = await this._showAuthDialog(authInfo.host, parent);
          callback(userInfo.username, userInfo.password);
        } catch (error) {
          console.warn('Failed to login using HTTP Basic Authentication');
        }
      }
    });

    app.on('will-quit', event => {
      event.preventDefault();
      appData.save();
      userSettings.save();

      this._quit();
    });

    this._evm.registerEventHandler(
      EventTypeMain.SetCheckForUpdatesAutomatically,
      (_event, autoUpdate) => {
        userSettings.setValue(
          SettingType.checkForUpdatesAutomatically,
          autoUpdate
        );
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.SetInstallUpdatesAutomatically,
      (_event, install) => {
        userSettings.setValue(SettingType.installUpdatesAutomatically, install);
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.LaunchInstallerDownloadPage,
      () => {
        shell.openExternal(
          'https://github.com/jupyterlab/jupyterlab-desktop/releases'
        );
      }
    );

    this._evm.registerEventHandler(EventTypeMain.LaunchAboutJupyterPage, () => {
      shell.openExternal('https://jupyter.org/about.html');
    });

    this._evm.registerEventHandler(
      EventTypeMain.SelectWorkingDirectory,
      event => {
        const currentPath = userSettings.resolvedWorkingDirectory;

        dialog
          .showOpenDialog({
            properties: [
              'openDirectory',
              'showHiddenFiles',
              'noResolveAliases'
            ],
            buttonLabel: 'Choose',
            defaultPath: currentPath
          })
          .then(({ filePaths }) => {
            if (filePaths.length > 0) {
              event.sender.send(
                EventTypeRenderer.WorkingDirectorySelected,
                filePaths[0]
              );
            }
          });
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.SetDefaultWorkingDirectory,
      (event, path: string) => {
        try {
          const resolved = resolveWorkingDirectory(path, false);
          const stat = fs.lstatSync(resolved);
          if (stat.isDirectory()) {
            userSettings.setValue(SettingType.defaultWorkingDirectory, path);
            event.sender.send(
              EventTypeRenderer.SetDefaultWorkingDirectoryResult,
              'SUCCESS'
            );
          } else {
            event.sender.send(
              EventTypeRenderer.SetDefaultWorkingDirectoryResult,
              'INVALID-PATH'
            );
            console.error('Failed to set working directory');
          }
        } catch (error) {
          event.sender.send(
            EventTypeRenderer.SetDefaultWorkingDirectoryResult,
            'FAILURE'
          );
          console.error('Failed to set working directory');
        }
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.SelectPythonPath,
      (event, currentPath) => {
        if (!currentPath) {
          currentPath = userSettings.getValue(SettingType.pythonPath);
          if (currentPath === '') {
            currentPath = getBundledPythonPath();
          }
        }

        dialog
          .showOpenDialog({
            properties: ['openFile', 'showHiddenFiles', 'noResolveAliases'],
            buttonLabel: 'Use Path',
            defaultPath: currentPath
          })
          .then(({ filePaths }) => {
            if (filePaths.length > 0) {
              event.sender.send(
                EventTypeRenderer.CustomPythonPathSelected,
                filePaths[0]
              );
            }
          });
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.InstallBundledPythonEnv,
      async (event, envPath: string) => {
        const installPath = envPath || getBundledPythonEnvPath();
        await installBundledEnvironment(installPath, {
          onInstallStatus: (status, message) => {
            event.sender.send(
              EventTypeRenderer.InstallPythonEnvStatus,
              status,
              message
            );
            if (status === EnvironmentInstallStatus.Success) {
              addUserSetEnvironment(installPath, true);
            }
          },
          get forceOverwrite() {
            return false;
          },
          confirmOverwrite: () => {
            return new Promise<boolean>(resolve => {
              const choice = dialog.showMessageBoxSync({
                type: 'warning',
                message: 'Do you want to overwrite?',
                detail: `Install path (${installPath}) is not empty. Would you like to overwrite it?`,
                buttons: ['Overwrite', 'Cancel'],
                defaultId: 1,
                cancelId: 1
              });

              // allow dialog to close
              if (choice === 0) {
                waitForDuration(200).then(() => {
                  resolve(true);
                });
              } else {
                resolve(false);
              }
            });
          }
        });
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.ShowManagePythonEnvironmentsDialog,
      async event => {
        this.showManagePythonEnvsDialog();
      }
    );

    this._evm.registerSyncEventHandler(
      EventTypeMain.GetNextPythonEnvironmentName,
      (event, path) => {
        return getNextPythonEnvName();
      }
    );

    this._evm.registerSyncEventHandler(
      EventTypeMain.SelectPythonEnvInstallDirectory,
      event => {
        const currentPath = getPythonEnvsDirectory();

        return new Promise<string>((resolve, reject) => {
          dialog
            .showOpenDialog({
              properties: [
                'openDirectory',
                'showHiddenFiles',
                'noResolveAliases',
                'createDirectory'
              ],
              buttonLabel: 'Use Directory',
              defaultPath: currentPath
            })
            .then(({ filePaths }) => {
              if (filePaths.length > 0) {
                resolve(filePaths[0]);
              }
            });
        });
      }
    );

    this._evm.registerSyncEventHandler(
      EventTypeMain.ValidatePythonPath,
      (event, path) => {
        return this._registry.validatePythonEnvironmentAtPath(path);
      }
    );

    this._evm.registerSyncEventHandler(
      EventTypeMain.UpdateRegistry,
      (event, cacheOK) => {
        return this.updateRegistry();
      }
    );

    this._evm.registerSyncEventHandler(
      EventTypeMain.GetPythonEnvironmentList,
      (event, cacheOK) => {
        return this._registry.getEnvironmentList(cacheOK);
      }
    );

    this._evm.registerSyncEventHandler(
      EventTypeMain.ValidateRemoteServerUrl,
      (event, url) => {
        return new Promise<any>((resolve, reject) => {
          this._validateRemoteServerUrl(url)
            .then(value => {
              resolve({ result: 'valid' });
            })
            .catch(error => {
              resolve({ result: 'invalid', error: error.message });
            });
        });
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.ShowInvalidPythonPathMessage,
      (event, path) => {
        const requirements = this._registry.getRequirements();
        const reqVersions = requirements.map(
          req => `${req.name} ${req.versionRange.format()}`
        );
        const reqList = reqVersions.join(', ');
        const message = `Failed to find a compatible Python environment at the configured path "${path}". Environment Python package requirements are: ${reqList}.`;
        dialog.showMessageBox({ message, type: 'error' });
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.SetDefaultPythonPath,
      (event, path) => {
        userSettings.setValue(SettingType.pythonPath, path);
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.SetStartupMode,
      (_event, mode) => {
        userSettings.setValue(SettingType.startupMode, mode);
      }
    );

    this._evm.registerEventHandler(EventTypeMain.SetTheme, (_event, theme) => {
      userSettings.setValue(SettingType.theme, theme);
    });

    this._evm.registerEventHandler(
      EventTypeMain.SetSyncJupyterLabTheme,
      (_event, sync) => {
        userSettings.setValue(SettingType.syncJupyterLabTheme, sync);
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.SetShowNewsFeed,
      (_event, show) => {
        userSettings.setValue(SettingType.showNewsFeed, show);
      }
    );

    this._evm.registerEventHandler(EventTypeMain.RestartApp, _event => {
      app.relaunch();
      app.quit();
    });

    this._evm.registerEventHandler(EventTypeMain.CheckForUpdates, _event => {
      this.checkForUpdates('always');
    });

    this._evm.registerEventHandler(
      EventTypeMain.SetLogLevel,
      (_event, logLevel: LogLevel) => {
        userSettings.setValue(SettingType.logLevel, logLevel);
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.SetServerLaunchArgs,
      (_event, serverArgs: string, overrideDefaultServerArgs: boolean) => {
        userSettings.setValue(SettingType.serverArgs, serverArgs || '');
        userSettings.setValue(
          SettingType.overrideDefaultServerArgs,
          overrideDefaultServerArgs
        );
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.SetServerEnvVars,
      (_event, serverEnvVars: any) => {
        userSettings.setValue(SettingType.serverEnvVars, serverEnvVars || {});
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.SetCtrlWBehavior,
      (_event, behavior: CtrlWBehavior) => {
        userSettings.setValue(SettingType.ctrlWBehavior, behavior);
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.CreateNewPythonEnvironment,
      async (event, envPath: string, envType: string, packages: string) => {
        event.sender.send(
          EventTypeRenderer.InstallPythonEnvStatus,
          EnvironmentInstallStatus.Started
        );
        try {
          await createPythonEnvironment(envPath, envType, packages, {
            stdout: (msg: string) => {
              event.sender.send(
                EventTypeRenderer.InstallPythonEnvStatus,
                EnvironmentInstallStatus.Running,
                msg
              );
            }
          });
          event.sender.send(
            EventTypeRenderer.InstallPythonEnvStatus,
            EnvironmentInstallStatus.Success
          );
        } catch (error) {
          event.sender.send(
            EventTypeRenderer.InstallPythonEnvStatus,
            EnvironmentInstallStatus.Failure
          );
        }
      }
    );

    this._evm.registerSyncEventHandler(
      EventTypeMain.GetServerInfo,
      (event): Promise<IServerInfo> => {
        for (const sessionWindow of this._sessionWindowManager.windows) {
          if (
            event.sender === sessionWindow.titleBarView?.view?.webContents ||
            event.sender === sessionWindow.labView?.view?.webContents
          ) {
            return sessionWindow.getServerInfo();
          }
        }
      }
    );

    this._evm.registerSyncEventHandler(EventTypeMain.IsDarkTheme, event => {
      return isDarkTheme(userSettings.getValue(SettingType.theme));
    });

    this._evm.registerSyncEventHandler(
      EventTypeMain.ClearHistory,
      async (event, options: IClearHistoryOptions) => {
        if (options.recentRemoteURLs) {
          appData.recentRemoteURLs = [];
        }
        if (options.userSetPythonEnvs) {
          this._registry.clearUserSetPythonEnvs();
        }
        if (options.sessionData || options.recentSessions) {
          appData.recentSessions.forEach(async recentSession => {
            if (
              recentSession.partition &&
              recentSession.partition.startsWith('persist:')
            ) {
              const s = session.fromPartition(recentSession.partition);
              try {
                await clearSession(s);
              } catch (error) {
                //
              }
            }
          });
        }

        if (options.sessionData) {
          try {
            await clearSession(session.defaultSession);
          } catch (error) {
            //
          }
        }

        if (options.recentSessions) {
          appData.recentSessions = [];

          this._sessionWindowManager.windows.forEach(sessionWindow => {
            sessionWindow.updateRecentSessionList(true);
          });
        }

        return true;
      }
    );
  }

  private _showUpdateDialog(
    type: 'updates-available' | 'error' | 'no-updates'
  ) {
    const dialog = new UpdateDialog({
      isDarkTheme: isDarkTheme(userSettings.getValue(SettingType.theme)),
      type
    });

    dialog.load();
  }

  checkForUpdates(showDialog: 'on-new-version' | 'always') {
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
    this.dispose()
      .then(() => {
        process.exit();
      })
      .catch(err => {
        log.error(new Error('JupyterLab could not close successfully'));
        process.exit();
      });
  }

  private _cliArgs: ICLIArguments;
  private _registry: IRegistry;
  private _serverFactory: JupyterServerFactory;
  private _disposePromise: Promise<void>;
  private _sessionWindowManager: SessionWindowManager;
  private _evm = new EventManager();
  private _settingsDialog: SettingsDialog;
  private _aboutDialog: AboutDialog;
  private _isDarkTheme: boolean;
}
