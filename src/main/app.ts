// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { app, autoUpdater, dialog, session, shell } from 'electron';
import log from 'electron-log';
import { IRegistry, Registry } from './registry';
import fetch from 'node-fetch';
import * as yaml from 'js-yaml';
import * as semver from 'semver';
import * as fs from 'fs';
import {
  clearSession,
  getAppDir,
  getBundledPythonEnvPath,
  getBundledPythonPath,
  isDarkTheme,
  waitForDuration
} from './utils';
import { execFile } from 'child_process';
import { IServerFactory, JupyterServerFactory } from './server';
import { connectAndGetServerInfo, IJupyterServerInfo } from './connect';
import { UpdateDialog } from './updatedialog/updatedialog';
import {
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
import { ICLIArguments, IDisposable } from './tokens';
import { SessionConfig } from './config/sessionconfig';
import { EventManager } from './eventmanager';
import { EventTypeMain, EventTypeRenderer } from './eventtypes';

export interface IApplication {
  createNewEmptySession(): void;
  checkForUpdates(showDialog: 'on-new-version' | 'always'): void;
  cliArgs: ICLIArguments;
}

interface IClearHistoryOptions {
  sessionData: boolean;
  recentRemoteURLs: boolean;
  recentSessions: boolean;
  userSetPythonEnvs: boolean;
}

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
      sessionWindow.contentViewType === ContentViewType.Welcome;
    });

    if (emptySessionWindow) {
      return emptySessionWindow;
    }

    return this.createNewEmptyWindow();
  }

  createNew(
    contentView?: ContentViewType,
    sessionConfig?: SessionConfig,
    restorePosition?: boolean
  ): SessionWindow {
    const window = new SessionWindow({
      app: this._options.app,
      registry: this._options.registry,
      serverFactory: this._options.serverFactory,
      contentView: contentView,
      sessionConfig,
      center: !restorePosition
    });
    window.load();

    this._windows.push(window);

    window.sessionConfigChanged.connect(() => {
      this.syncSessionData();
    });

    window.window.on('close', async event => {
      const index = this._windows.indexOf(window);
      if (index !== -1) {
        await window.dispose();
        this._windows.splice(index, 1);
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

    this.startup();
  }

  createNewEmptySession() {
    this._sessionWindowManager.createNewEmptyWindow();
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

  dispose(): Promise<void> {
    if (this._disposePromise) {
      return this._disposePromise;
    }

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
      async event => {
        event.sender.send(
          EventTypeRenderer.InstallBundledPythonEnvStatus,
          'STARTED'
        );
        const platform = process.platform;
        const isWin = platform === 'win32';
        const appDir = getAppDir();
        const appVersion = app.getVersion();
        const installerPath = isWin
          ? `${appDir}\\env_installer\\JupyterLabDesktopAppServer-${appVersion}-Windows-x86_64.exe`
          : platform === 'darwin'
          ? `${appDir}/env_installer/JupyterLabDesktopAppServer-${appVersion}-MacOSX-x86_64.sh`
          : `${appDir}/env_installer/JupyterLabDesktopAppServer-${appVersion}-Linux-x86_64.sh`;
        const installPath = getBundledPythonEnvPath();

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
            // allow dialog to close
            await waitForDuration(200);
            fs.rmdirSync(installPath, { recursive: true });
          } else {
            event.sender.send(
              EventTypeRenderer.InstallBundledPythonEnvStatus,
              'CANCELLED'
            );
            return;
          }
        }

        const installerProc = execFile(
          installerPath,
          ['-b', '-p', installPath],
          {
            shell: isWin ? 'cmd.exe' : '/bin/bash',
            env: {
              ...process.env
            }
          }
        );

        installerProc.on('exit', (exitCode: number) => {
          if (exitCode === 0) {
            event.sender.send(
              EventTypeRenderer.InstallBundledPythonEnvStatus,
              'SUCCESS'
            );
          } else {
            const message = `Installer Exit: ${exitCode}`;
            event.sender.send(
              EventTypeRenderer.InstallBundledPythonEnvStatus,
              'FAILURE',
              message
            );
            log.error(new Error(message));
          }
        });

        installerProc.on('error', (err: Error) => {
          event.sender.send(
            EventTypeRenderer.InstallBundledPythonEnvStatus,
            'FAILURE',
            err.message
          );
          log.error(err);
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

    this._evm.registerEventHandler(
      EventTypeMain.SetFrontendMode,
      (_event, mode) => {
        userSettings.setValue(SettingType.frontEndMode, mode);
      }
    );

    this._evm.registerEventHandler(EventTypeMain.RestartApp, _event => {
      app.relaunch();
      app.quit();
    });

    this._evm.registerEventHandler(EventTypeMain.CheckForUpdates, _event => {
      this.checkForUpdates('always');
    });

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
          appData.userSetPythonEnvs = [];
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
}
