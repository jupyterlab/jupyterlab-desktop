// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  BrowserView,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  MenuItemConstructorOptions,
  shell
} from 'electron';
import * as fs from 'fs';
import { WelcomeView } from '../welcomeview/welcomeview';
import { LabView } from '../labview/labview';
import {
  DEFAULT_WIN_HEIGHT,
  DEFAULT_WIN_WIDTH,
  SettingType,
  userSettings,
  WorkspaceSettings
} from '../config/settings';
import { TitleBarView } from '../titlebarview/titlebarview';
import {
  clearSession,
  DarkThemeBGColor,
  envPathForPythonPath,
  getBundledPythonPath,
  getLogFilePath,
  isDarkTheme,
  LightThemeBGColor
} from '../utils';
import { IServerFactory, JupyterServer, JupyterServerFactory } from '../server';
import {
  IDisposable,
  IPythonEnvironment,
  IRect,
  IVersionContainer,
  PythonEnvResolveErrorType
} from '../tokens';
import { IRegistry } from '../registry';
import { IApplication } from '../app';
import { SettingsDialog } from '../settingsdialog/settingsdialog';
import { RemoteServerSelectDialog } from '../remoteserverselectdialog/remoteserverselectdialog';
import { PythonEnvironmentSelectPopup } from '../pythonenvselectpopup/pythonenvselectpopup';
import { ProgressView } from '../progressview/progressview';
import { appData } from '../config/appdata';
import { SessionConfig } from '../config/sessionconfig';
import { ISignal, Signal } from '@lumino/signaling';
import { EventTypeMain } from '../eventtypes';
import { EventManager } from '../eventmanager';
import { runCommandInEnvironment } from '../env';

export enum ContentViewType {
  Welcome = 'welcome',
  Lab = 'lab'
}

export interface IServerInfo {
  type: 'local' | 'remote';
  url?: string;
  persistSessionData?: boolean;
  environment?: {
    name?: string;
    path?: string;
    versions?: IVersionContainer;
  };
  workingDirectory?: string;
  defaultKernel?: string;
  pageConfig?: any;
  error?: string;
}

const titleBarHeight = 29;
const defaultEnvSelectPopupHeight = 330;

export class SessionWindow implements IDisposable {
  constructor(options: SessionWindow.IOptions) {
    this._app = options.app;
    this._registry = options.registry;
    this._serverFactory = options.serverFactory;
    this._contentViewType = options.contentView;
    this._sessionConfig = options.sessionConfig;
    this._wsSettings = new WorkspaceSettings(
      this._sessionConfig?.workingDirectory
    );

    // if a python path was specified together with working directory,
    // then set it as workspace setting
    const savePythonPathToWS =
      this._sessionConfig?.pythonPath &&
      this._app.cliArgs &&
      (this._app.cliArgs.workingDir || this._app.cliArgs._.length > 0);

    if (savePythonPathToWS) {
      this._wsSettings.setValue(
        SettingType.pythonPath,
        this._sessionConfig.pythonPath
      );
    }

    this._isDarkTheme = isDarkTheme(
      this._wsSettings.getValue(SettingType.theme)
    );

    let rect: IRect;

    if (options.rect) {
      rect = options.rect;
    } else {
      rect = {
        x: this._sessionConfig?.x !== undefined ? this._sessionConfig.x : 100,
        y: this._sessionConfig?.y !== undefined ? this._sessionConfig.y : 100,
        width: this._sessionConfig?.width || DEFAULT_WIN_WIDTH,
        height: this._sessionConfig?.height || DEFAULT_WIN_HEIGHT
      };
    }

    this._window = new BrowserWindow({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      minWidth: 400,
      minHeight: 300,
      show: false,
      title: 'JupyterLab',
      titleBarStyle: 'hidden',
      frame: process.platform === 'darwin',
      backgroundColor: this._isDarkTheme ? DarkThemeBGColor : LightThemeBGColor,
      webPreferences: {
        devTools: false
      }
    });

    this._window.setMenuBarVisibility(false);
    this._window.show();

    this._registerListeners();
    this._createProgressView();
    this._createEnvSelectPopup();
  }

  get window(): BrowserWindow {
    return this._window;
  }

  private async _createServerForSession() {
    const serverOptions: JupyterServer.IOptions = {
      workingDirectory: this._sessionConfig.resolvedWorkingDirectory
    };

    const pythonPath = this._wsSettings.getValue(SettingType.pythonPath);

    if (pythonPath) {
      serverOptions.environment = this._registry.getEnvironmentByPath(
        pythonPath
      );
    }

    const server = await this.serverFactory.createServer(serverOptions);
    this._server = server;
    await server.server.started;
    const serverInfo = server.server.info;
    this._sessionConfig.token = serverInfo.token;
    this._sessionConfig.url = serverInfo.url;
    this._sessionConfig.defaultKernel = serverInfo.environment.defaultKernel;
  }

  load() {
    const titleBarView = new TitleBarView({ isDarkTheme: this._isDarkTheme });
    this._window.addBrowserView(titleBarView.view);
    titleBarView.view.setBounds({
      x: 0,
      y: 0,
      width: DEFAULT_WIN_WIDTH,
      height: titleBarHeight
    });

    this._window.on('focus', () => {
      titleBarView.activate();
    });
    this._window.on('blur', () => {
      titleBarView.deactivate();
    });

    titleBarView.load();
    this._titleBarView = titleBarView;

    if (this._contentViewType === ContentViewType.Lab) {
      if (this._sessionConfig.isRemote) {
        this._createSessionForRemoteUrl(
          this._sessionConfig.remoteURL,
          this._sessionConfig.persistSessionData,
          this._sessionConfig.partition
        );
      } else {
        this._createServerForSession()
          .then(() => {
            this._updateContentView();
            if (this._sessionConfig.filesToOpen.length > 0) {
              this._labView.labUIReady.then(() => {
                this._labView.openFiles();
              });
            }
            appData.addSessionToRecents({
              workingDirectory: this._sessionConfig.resolvedWorkingDirectory,
              filesToOpen: [...this._sessionConfig.filesToOpen]
            });
          })
          .catch(error => {
            this._setProgress(
              'Failed to create session',
              `<div class="message-row">${error}</div>
          <div class="message-row">
            <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowWelcomeView}')">Go to Welcome Page</a>
          </div>`,
              false
            );
          });
        this._resizeViews();
      }
    } else {
      this._updateContentView();
    }

    this._window.on('resize', () => {
      this._updateSessionWindowPositionConfig();
      this._resizeViewsDelayed();
    });
    this._window.on('maximize', () => {
      this._resizeViewsDelayed();
    });
    this._window.on('unmaximize', () => {
      this._resizeViewsDelayed();
    });
    this._window.on('restore', () => {
      this._resizeViewsDelayed();
    });
    this._window.on('move', () => {
      this._updateSessionWindowPositionConfig();
    });
    this._window.on('moved', () => {
      this._updateSessionWindowPositionConfig();
    });
  }

  private async _disposeSession(): Promise<void> {
    this._wsSettings.save();

    if (this._sessionConfig?.isRemote) {
      if (!this._sessionConfig.persistSessionData) {
        return clearSession(this._labView.view.webContents.session);
      }
    } else {
      if (!this._server?.server) {
        return;
      }

      await this._server.server.stop();
      this._server = null;
      if (this._labView) {
        if (!this._window.isDestroyed()) {
          this._window.removeBrowserView(this._labView.view);
        }
        this._labView.dispose();
        this._labView = null;
      }
    }
  }

  updateRecentSessionList(resetCollapseState: boolean) {
    if (this._welcomeView) {
      this._welcomeView.updateRecentSessionList(resetCollapseState);
    }
  }

  dispose(): Promise<void> {
    if (this._disposePromise) {
      return this._disposePromise;
    }

    this._disposePromise = new Promise<void>(resolve => {
      this._evm.dispose();
      appData.recentSessionsChanged.disconnect(
        this._recentSessionsChangedHandler,
        this
      );

      this._disposeSession().then(() => {
        this._disposePromise = null;
        resolve();
      });
    });

    return this._disposePromise;
  }

  private _loadWelcomeView() {
    const welcomeView = new WelcomeView({
      registry: this._registry,
      isDarkTheme: this._isDarkTheme
    });
    this._window.addBrowserView(welcomeView.view);
    welcomeView.view.setBounds({
      x: 0,
      y: titleBarHeight,
      width: DEFAULT_WIN_WIDTH,
      height: DEFAULT_WIN_HEIGHT
    });

    welcomeView.load();

    this._welcomeView = welcomeView;
  }

  private _createProgressView() {
    const progressView = new ProgressView({ isDarkTheme: this._isDarkTheme });
    progressView.load();

    this._progressView = progressView;
  }

  private _showProgressView(
    title: string,
    detail?: string,
    showAnimation?: boolean
  ) {
    if (!this._progressViewVisible) {
      this._window.addBrowserView(this._progressView.view.view);
      this._progressViewVisible = true;
      this._titleBarView.showServerStatus(false);
    }

    this._resizeViews();

    this._progressView.setProgress(title, detail, showAnimation !== false);
  }

  private _setProgress(title: string, detail: string, showAnimation: boolean) {
    this._progressView.setProgress(title, detail, showAnimation);
  }

  private _hideProgressView() {
    if (!this._progressViewVisible) {
      return;
    }

    this._window.removeBrowserView(this._progressView.view.view);
    this._progressViewVisible = false;
    this._titleBarView.showServerStatus(
      this._contentViewType === ContentViewType.Lab
    );
  }

  private _loadLabView() {
    const labView = new LabView({
      isDarkTheme: this._isDarkTheme,
      parent: this,
      sessionConfig: this._sessionConfig
    });
    this._window.addBrowserView(labView.view);

    // transfer focus to labView
    this._window.webContents.on('focus', () => {
      labView.view.webContents.focus();
    });
    this._titleBarView.view.webContents.on('focus', () => {
      labView.view.webContents.focus();
    });
    labView.view.webContents.on('did-finish-load', () => {
      labView.view.webContents.focus();
    });

    labView.load((errorCode: number, errorDescription: string) => {
      this._showProgressView(
        'Failed to load JupyterLab',
        `
      <div class="message-row">Error: ${errorDescription}</div>
        <div class="message-row">
          <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowWelcomeView}')">Go to Welcome Page</a> 
        </div>
      `,
        false
      );
    });

    this._labView = labView;

    this._labView.view.webContents.on('focus', () => {
      this._hideEnvSelectPopup();
    });

    this.labView.view.webContents.on('page-title-updated', (event, title) => {
      this.titleBarView.setTitle(title);
      this._window.setTitle(title);
    });

    if (this._sessionConfig.isRemote) {
      this._titleBarView.showServerStatus(true);
    } else {
      this._labView.labUIReady.then(() => {
        this._titleBarView.showServerStatus(true);
      });
    }

    if (userSettings.getValue(SettingType.notifyOnBundledEnvUpdates)) {
      let showServerNotificationBadge = false;
      const serverInfo = this.getServerInfo();
      if (
        serverInfo &&
        serverInfo.type === 'local' &&
        serverInfo.environment?.path === getBundledPythonPath()
      ) {
        if (!this._registry.bundledEnvironmentIsLatest()) {
          showServerNotificationBadge = true;
        }
      }
      this._titleBarView.showServerNotificationBadge(
        showServerNotificationBadge
      );
    }
  }

  get titleBarView(): TitleBarView {
    return this._titleBarView;
  }

  get labView(): LabView {
    return this._labView;
  }

  get contentViewType(): ContentViewType {
    return this._contentViewType;
  }

  get contentView(): BrowserView {
    if (this._contentViewType === ContentViewType.Welcome) {
      return this._welcomeView?.view;
    } else {
      return this._labView?.view;
    }
  }

  get sessionConfig(): SessionConfig {
    return this._sessionConfig;
  }

  get serverFactory(): IServerFactory {
    return this._serverFactory;
  }

  get registry(): IRegistry {
    return this._registry;
  }

  private _recentSessionsChangedHandler() {
    if (this._recentSessionRemovalByThis) {
      return;
    }
    this._welcomeView?.updateRecentSessionList(true);
  }

  private _registerListeners() {
    appData.recentSessionsChanged.connect(
      this._recentSessionsChangedHandler,
      this
    );

    this._window.on('close', async () => {
      await this.dispose();
    });

    this._evm.registerEventHandler(
      EventTypeMain.OpenNewsLink,
      (event, link) => {
        if (event.sender !== this._welcomeView?.view?.webContents) {
          return;
        }

        try {
          const url = new URL(decodeURIComponent(link));
          if (url.protocol === 'https:' || url.protocol === 'http:') {
            shell.openExternal(url.href);
          }
        } catch (error) {
          console.error('Invalid news URL');
        }
      }
    );

    this._evm.registerEventHandler(EventTypeMain.MinimizeWindow, event => {
      if (event.sender !== this._titleBarView?.view?.webContents) {
        return;
      }
      this._window.minimize();
    });

    this._evm.registerEventHandler(EventTypeMain.MaximizeWindow, event => {
      if (event.sender !== this._titleBarView?.view?.webContents) {
        return;
      }
      this._window.maximize();
    });

    this._evm.registerEventHandler(EventTypeMain.RestoreWindow, event => {
      if (event.sender !== this._titleBarView?.view?.webContents) {
        return;
      }
      this._window.unmaximize();
    });

    this._evm.registerEventHandler(EventTypeMain.CloseWindow, event => {
      if (event.sender !== this._titleBarView?.view?.webContents) {
        return;
      }
      this._window.close();
    });

    this._evm.registerEventHandler(
      EventTypeMain.CreateNewSession,
      async (event, type: 'notebook' | 'blank') => {
        if (event.sender !== this.contentView?.webContents) {
          return;
        }

        this._showProgressView('Creating new session');

        const sessionConfig = SessionConfig.createLocal();
        this._sessionConfig = sessionConfig;
        this._wsSettings = new WorkspaceSettings(
          sessionConfig.workingDirectory
        );
        try {
          await this._createServerForSession();
          appData.addSessionToRecents({
            workingDirectory: this._sessionConfig.resolvedWorkingDirectory,
            filesToOpen: [...this._sessionConfig.filesToOpen]
          });
        } catch (error) {
          this._showProgressView(
            'Failed to create session!',
            `
            <div class="message-row">${error}</div>
            <div class="message-row">
              <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowWelcomeView}')">Go to Welcome Page</a>
            </div>
            <div class="message-row">
              <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.InstallBundledPythonEnv}')">Install / update Python environment using the bundled installer</a>
            </div>
            <div class="message-row">
              <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowManagePythonEnvironmentsDialog}', 'settings')">Change the default Python environment</a>
            </div>
          `,
            false
          );
        }

        this._contentViewType = ContentViewType.Lab;
        this._updateContentView();
        this._updateSessionWindowPositionConfig();
        this._sessionConfigChanged.emit();

        if (type === 'notebook') {
          this.labView.labUIReady.then(() => {
            this.labView.newNotebook();
            this._hideProgressView();
          });
        } else {
          this._hideProgressView();
        }
        appData.addSessionToRecents({
          workingDirectory: sessionConfig.resolvedWorkingDirectory,
          filesToOpen: [...sessionConfig.filesToOpen]
        });
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.OpenFileOrFolder,
      async event => {
        if (event.sender !== this.contentView?.webContents) {
          return;
        }

        this._handleFileOrFolderOpenSession('either');
      }
    );

    this._evm.registerEventHandler(EventTypeMain.OpenFile, async event => {
      if (event.sender !== this.contentView?.webContents) {
        return;
      }

      this._handleFileOrFolderOpenSession('file');
    });

    this._evm.registerEventHandler(EventTypeMain.OpenFolder, async event => {
      if (event.sender !== this.contentView?.webContents) {
        return;
      }

      this._handleFileOrFolderOpenSession('folder');
    });

    this._evm.registerEventHandler(
      EventTypeMain.CreateNewRemoteSession,
      async event => {
        if (event.sender !== this.contentView?.webContents) {
          return;
        }

        this._selectRemoteServerUrl();
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.SetRemoteServerOptions,
      (event, remoteUrl: string, persistSessionData: boolean) => {
        if (
          event.sender !== this._remoteServerSelectDialog?.window?.webContents
        ) {
          return;
        }

        this._remoteServerSelectDialog.window.close();
        this._remoteServerSelectDialog = null;

        this._createSessionForRemoteUrl(
          remoteUrl,
          persistSessionData,
          undefined
        );
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.OpenRecentSession,
      (event, sessionIndex: number) => {
        if (event.sender !== this._welcomeView?.view?.webContents) {
          return;
        }

        this._createSessionForRecent(sessionIndex);
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.DeleteRecentSession,
      async (event, sessionIndex: number) => {
        if (
          !(
            event.sender === this._welcomeView?.view?.webContents ||
            event.sender === this._progressView?.view?.view?.webContents
          )
        ) {
          return;
        }

        // update this window's list without resetting collapse state
        this._recentSessionRemovalByThis = true;

        await appData.removeSessionFromRecents(sessionIndex);

        this._recentSessionRemovalByThis = false;

        if (event.sender === this._welcomeView.view.webContents) {
          this._welcomeView.updateRecentSessionList(false);
        }
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.OpenRecentSessionWithDefaultEnv,
      (event, sessionIndex: number) => {
        if (event.sender !== this._progressView?.view?.view?.webContents) {
          return;
        }

        this._createSessionForRecent(sessionIndex, true);
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.InstallPythonEnvRequirements,
      (
        event,
        pythonPath: string,
        postInstallAction: 'none' | 'restart-server' = 'none'
      ) => {
        if (event.sender !== this._progressView?.view?.view?.webContents) {
          return;
        }

        pythonPath = decodeURIComponent(pythonPath);
        // prevent injections by checking if the path is really file
        const stat = fs.lstatSync(pythonPath);
        if (!(stat && (stat.isFile() || stat.isSymbolicLink()))) {
          console.error(
            'InstallPythonEnvRequirements called with invalid Python path.'
          );
          return;
        }

        const envPath = envPathForPythonPath(pythonPath);
        const installCommand = this._registry.getRequirementsInstallCommand(
          envPath
        );

        this._showProgressView('Installing required packages');

        runCommandInEnvironment(envPath, installCommand).then(result => {
          if (result) {
            this._showProgressView(
              'Finished installing packages',
              postInstallAction === 'restart-server'
                ? '<div class="message-row">Restarting the server now...</div>'
                : ''
            );
            try {
              this._registry.addEnvironment(pythonPath);
              if (postInstallAction === 'restart-server') {
                this._restartServerInPythonEnvironment(pythonPath);
              } else {
                this._showProgressView(
                  'Finished installing required packages',
                  `<div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowWelcomeView}')">Go to Welcome Page</a></div>`
                );
              }
            } catch (error) {
              this._showProgressView(
                'Failed to update the environment',
                `<div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowLogs}')">Show logs</a></div>
                <div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.HideProgressView}')">Close</a></div>`
              );
            }
          } else {
            this._showProgressView(
              'Failed to install required packages',
              `<div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowLogs}')">Show logs</a></div>
              <div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.HideProgressView}')">Close</a></div>`
            );
          }
        });
      }
    );

    this._evm.registerEventHandler(EventTypeMain.ShowLogs, event => {
      shell.openPath(getLogFilePath());
    });

    this._evm.registerEventHandler(
      EventTypeMain.CopyToClipboard,
      (event, content) => {
        clipboard.writeText(content);
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.OpenDroppedFiles,
      (event, fileOrFolders: string[]) => {
        if (event.sender !== this._welcomeView?.view?.webContents) {
          return;
        }

        this.handleOpenFilesOrFolders(fileOrFolders);
      }
    );

    this._evm.registerEventHandler(EventTypeMain.ShowEnvSelectPopup, event => {
      if (
        !(
          event.sender === this._titleBarView?.view?.webContents ||
          event.sender === this._progressView?.view?.view?.webContents
        )
      ) {
        return;
      }

      this._showEnvSelectPopup();
    });

    this._evm.registerEventHandler(EventTypeMain.HideEnvSelectPopup, event => {
      if (event.sender !== this._envSelectPopup?.view?.view?.webContents) {
        return;
      }

      this._hideEnvSelectPopup();
    });

    this._evm.registerEventHandler(
      EventTypeMain.SetSessionPythonPath,
      async (event, path) => {
        if (event.sender !== this._envSelectPopup?.view?.view?.webContents) {
          return;
        }

        this._hideEnvSelectPopup();

        this._showProgressView(
          'Restarting server using the selected Python enviroment'
        );

        try {
          this._registry.addEnvironment(path);
        } catch (error) {
          let message = `Error! Python environment at '${path}' is not compatible.`;
          if (
            error?.type === PythonEnvResolveErrorType.RequirementsNotSatisfied
          ) {
            const envPath = envPathForPythonPath(path);
            const requirementInstallCmd = encodeURIComponent(
              this._registry.getRequirementsInstallCommand(envPath)
            );
            message = `Error! Required Python packages not found in the selected environment. You can install using <copyable-span label="${requirementInstallCmd}" copied="${requirementInstallCmd}"></copyable-span> command in the selected environment.`;
          } else if (error?.type === PythonEnvResolveErrorType.PathNotFound) {
            message = `Error! File not found at '${path}'.`;
          } else if (error?.type === PythonEnvResolveErrorType.ResolveError) {
            message = `Error! Failed to get environment information at '${path}'.`;
          }
          this._showProgressView(
            'Invalid Environment',
            `<div class="message-row">${message}</div>
          ${
            error?.type === PythonEnvResolveErrorType.RequirementsNotSatisfied
              ? `<div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('${
                  EventTypeMain.InstallPythonEnvRequirements
                }', '${encodeURIComponent(
                  path
                )}', 'restart-server')">Install the requirements for me and restart the server</a></div>`
              : ''
          }
          <div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('${
            EventTypeMain.ShowEnvSelectPopup
          }')">Select another environment</a></div>
          <div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('${
            EventTypeMain.ShowLogs
          }')">Show logs</a></div>
          <div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('${
            EventTypeMain.HideProgressView
          }')">Cancel</a></div>`,
            false
          );

          return;
        }

        this._restartServerInPythonEnvironment(path);
      }
    );

    this._evm.registerEventHandler(EventTypeMain.ShowAppContextMenu, event => {
      if (event.sender !== this._titleBarView?.view?.webContents) {
        return;
      }

      const template: MenuItemConstructorOptions[] = [
        {
          label: 'New Window',
          click: () => {
            this._newWindow();
          }
        },
        {
          label: 'Close Session',
          visible:
            this._contentViewType === ContentViewType.Lab &&
            !this._progressViewVisible,
          click: () => {
            this._closeSession();
          }
        },
        { type: 'separator' },
        {
          label: 'Settings',
          click: () => {
            this._app.showSettingsDialog();
          }
        },
        {
          label: 'Manage Python environments',
          click: () => {
            this._app.showManagePythonEnvsDialog();
          }
        },
        {
          label: 'Check for updates…',
          click: () => {
            this._app.checkForUpdates('always');
          }
        },
        {
          label: 'Open Developer Tools',
          visible:
            this._contentViewType === ContentViewType.Lab ||
            process.env.NODE_ENV === 'development',
          click: () => {
            this._openDevTools();
          }
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            this._app.showAboutDialog();
          }
        }
      ];

      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        window: BrowserWindow.fromWebContents(event.sender)
      });
    });

    this._evm.registerEventHandler(
      EventTypeMain.HideProgressView,
      async event => {
        if (event.sender !== this._progressView?.view?.view?.webContents) {
          return;
        }

        this._hideProgressView();
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.ShowWelcomeView,
      async event => {
        if (event.sender !== this._progressView?.view?.view?.webContents) {
          return;
        }

        this._showWelcomeView();
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.ShowServerSettings,
      async event => {
        if (
          !(
            event.sender === this._progressView?.view?.view?.webContents ||
            event.sender === this._welcomeView?.view?.webContents
          )
        ) {
          return;
        }

        this._app.showSettingsDialog(SettingsDialog.Tab.Server);
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.TitleBarMouseEvent,
      (event, type: string, params: any) => {
        if (event.sender !== this._titleBarView?.view?.webContents) {
          return;
        }

        if (type === 'mousedown') {
          this._hideEnvSelectPopup();
        }
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.RestartSession,
      async event => {
        if (event.sender !== this._envSelectPopup?.view?.view?.webContents) {
          return;
        }

        let currentPythonPath = this._wsSettings.getValue(
          SettingType.pythonPath
        );
        if (!currentPythonPath) {
          const defaultEnv = await this.registry.getDefaultEnvironment();
          if (defaultEnv) {
            currentPythonPath = defaultEnv.path;
          }
        }

        if (!currentPythonPath) {
          return;
        }

        this._hideEnvSelectPopup();
        this._restartServerInPythonEnvironment(currentPythonPath);
      }
    );

    this._evm.registerEventHandler(
      EventTypeMain.CopySessionInfoToClipboard,
      event => {
        if (event.sender !== this._envSelectPopup?.view?.view?.webContents) {
          return;
        }

        const serverInfo = this.getServerInfo();

        let content = '';

        if (serverInfo.type === 'local') {
          content = [
            'type: local server',
            `url: ${serverInfo.url}`,
            `server root: ${serverInfo.workingDirectory}`,
            `env name: ${serverInfo.environment.name}`,
            `env Python path: ${serverInfo.environment.path}`,
            `versions: ${JSON.stringify(serverInfo.environment.versions)}`
          ].join('\n');
        } else {
          const url = new URL(serverInfo.url);
          const isLocalUrl =
            url.hostname === 'localhost' || url.hostname === '127.0.0.1';

          content = [
            `type: ${isLocalUrl ? 'local' : 'remote'} connection`,
            `url: ${serverInfo.url}`,
            `session data: ${
              serverInfo.persistSessionData ? '' : 'not '
            }persisted`
          ].join('\n');
        }

        clipboard.writeText(content);
      }
    );
  }

  private _restartServerInPythonEnvironment(pythonPath: string) {
    this._wsSettings.setValue(SettingType.pythonPath, pythonPath);
    this._sessionConfig.pythonPath = pythonPath;

    this._disposeSession().then(async () => {
      try {
        await this._createServerForSession();
        this._contentViewType = ContentViewType.Lab;
        this._updateContentView();
        this._hideProgressView();
      } catch (error) {
        this._setProgress(
          'Failed to create session',
          `<div class="message-row">${error}</div>
        <div class="message-row">
          <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowWelcomeView}')">Go to Welcome Page</a>
        </div>`,
          false
        );
      }
    });
  }

  getPythonEnvironment(): IPythonEnvironment {
    if (this._server?.server) {
      return this._server?.server.info.environment;
    }
  }

  getServerInfo(): IServerInfo {
    if (this._contentViewType !== ContentViewType.Lab) {
      return null;
    }

    if (this._sessionConfig?.remoteURL) {
      const serverInfo: IServerInfo = {
        type: 'remote',
        url: this._sessionConfig.remoteURL,
        persistSessionData: this._sessionConfig.persistSessionData
      };

      return serverInfo;
    } else {
      if (this._server?.server) {
        const info = this._server?.server.info;
        const serverInfo: IServerInfo = {
          type: 'local',
          environment: {
            name: info.environment.name,
            path: info.environment.path,
            versions: info.environment.versions
          },
          workingDirectory: info.workingDirectory,
          defaultKernel: info.environment.defaultKernel,
          url: this._sessionConfig.url?.href
        };

        return serverInfo;
      }
    }
  }

  get sessionConfigChanged(): ISignal<this, void> {
    return this._sessionConfigChanged;
  }

  private _updateContentView() {
    if (this._contentViewType === ContentViewType.Welcome) {
      this._titleBarView.showServerStatus(false);
      if (this._labView) {
        this._window.removeBrowserView(this._labView.view);
        this._labView.dispose();
        this._labView = null;
      }
      this._loadWelcomeView();

      this.titleBarView.setTitle('Welcome');
      this._window.setTitle('Welcome');
    } else {
      if (this._welcomeView) {
        this._window.removeBrowserView(this._welcomeView.view);
        this._welcomeView = null;
      }
      this._loadLabView();
    }

    this._resizeViews();
  }

  private _resizeViewsDelayed() {
    // on linux a delayed resize is necessary
    setTimeout(() => {
      this._resizeViews();
    }, 300);
  }

  private _resizeViews() {
    const { width, height } = this._window.getContentBounds();
    // add padding to allow resizing around title bar
    const padding = process.platform === 'darwin' ? 0 : 1;
    this._titleBarView.view.setBounds({
      x: padding,
      y: padding,
      width: width - 2 * padding,
      height: titleBarHeight - padding
    });
    const contentRect: Electron.Rectangle = {
      x: 0,
      y: titleBarHeight,
      width: width,
      height: height - titleBarHeight
    };
    this.contentView?.setBounds(contentRect);

    if (this._progressViewVisible) {
      this._progressView.view.view.setBounds(contentRect);
    }

    this._resizeEnvSelectPopup();

    // invalidate to trigger repaint
    // TODO: on linux, electron 22 does not repaint properly after resize
    // check if fixed in newer versions
    setTimeout(() => {
      this._titleBarView.view.webContents.invalidate();
      this.contentView?.webContents.invalidate();
      if (this._envSelectPopup) {
        this._envSelectPopup.view.view.webContents.invalidate();
      }
    }, 200);
  }

  private _updateSessionWindowPositionConfig() {
    if (!this._sessionConfig) {
      return;
    }
    const [x, y] = this._window.getPosition();
    const [width, height] = this._window.getSize();
    this._sessionConfig.width = width;
    this._sessionConfig.height = height;
    this._sessionConfig.x = x;
    this._sessionConfig.y = y;
  }

  private _openDevTools() {
    this._window.getBrowserViews().forEach(view => {
      view.webContents.openDevTools();
    });
  }

  private async _selectRemoteServerUrl() {
    this._remoteServerSelectDialog = new RemoteServerSelectDialog({
      isDarkTheme: this._isDarkTheme,
      parent: this._window,
      modal: true,
      persistSessionData: true
    });

    this._remoteServerSelectDialog.load();

    this._registry.getRunningServerList().then(runningServers => {
      this._remoteServerSelectDialog.setRunningServerList(runningServers);
    });
  }

  private async _createEnvSelectPopup() {
    let defaultEnv: IPythonEnvironment;
    try {
      defaultEnv = await this._registry.getDefaultEnvironment();
    } catch (error) {
      //
    }

    const defaultPythonPath = defaultEnv ? defaultEnv.path : '';

    this._envSelectPopup = new PythonEnvironmentSelectPopup({
      app: this._app,
      isDarkTheme: this._isDarkTheme,
      envs: [], // start with empty list, populate later
      bundledPythonPath: getBundledPythonPath(),
      defaultPythonPath
    });

    const listPromise = this.registry.getEnvironmentList(false);

    this._envSelectPopup.view.view.webContents.on('did-finish-load', () => {
      listPromise.then(envs => {
        this._envSelectPopup.setPythonEnvironmentList(envs);
        this._resizeEnvSelectPopup();
        this._envSelectPopup.resetView();
      });
    });

    this._envSelectPopup.load();
  }

  private async _showEnvSelectPopup() {
    if (this._envSelectPopupVisible) {
      return;
    }

    const serverInfo = this.getServerInfo();
    this._envSelectPopup.setCurrentPythonPath(serverInfo?.environment?.path);
    this._envSelectPopup.resetView();

    this._window.addBrowserView(this._envSelectPopup.view.view);
    this._envSelectPopupVisible = true;
    this._resizeEnvSelectPopup();
    this._envSelectPopup.view.view.webContents.focus();

    if (userSettings.getValue(SettingType.notifyOnBundledEnvUpdates)) {
      let showUpdateBundledEnvAction = false;
      if (
        serverInfo &&
        serverInfo.type === 'local' &&
        serverInfo.environment?.path === getBundledPythonPath()
      ) {
        if (!this._registry.bundledEnvironmentIsLatest()) {
          showUpdateBundledEnvAction = true;
        }
      }
      this._envSelectPopup.showUpdateBundledEnvAction(
        showUpdateBundledEnvAction
      );
    }
  }

  private _resizeEnvSelectPopup() {
    if (!this._envSelectPopupVisible) {
      return;
    }

    const titleBarRect = this._titleBarView.view.getBounds();
    const popupWidth = 600;
    const paddingRight = process.platform === 'darwin' ? 33 : 127;
    // shorten browser view height if larger than max allowed
    const maxHeight = Math.min(
      this._envSelectPopup.getScrollHeight(),
      defaultEnvSelectPopupHeight
    );

    this._envSelectPopup.view.view.setBounds({
      x: Math.round(titleBarRect.width - paddingRight - popupWidth),
      y: Math.round(titleBarRect.height),
      width: popupWidth,
      height: Math.round(maxHeight)
    });
  }

  private _hideEnvSelectPopup() {
    if (!this._envSelectPopupVisible) {
      return;
    }
    this._window.removeBrowserView(this._envSelectPopup.view.view);
    this._envSelectPopupVisible = false;
  }

  async openSession(sessionConfig: SessionConfig) {
    if (this._sessionConfig && this._contentViewType === ContentViewType.Lab) {
      // TODO: this shouldn't happen anymore since sessions are launched in new empty window. remove after testing
      const choice = dialog.showMessageBoxSync({
        type: 'warning',
        message: 'Replace existing session',
        detail:
          'Opening a new JupyterLab session will close the existing one. Would you like to continue?',
        buttons: ['Continue', 'Cancel'],
        defaultId: 1,
        cancelId: 1
      });

      if (choice === 1) {
        return;
      }
    }

    this._disposeSession().then(() => {
      this._createSessionForLocal(
        sessionConfig.workingDirectory,
        sessionConfig.filesToOpen,
        sessionConfig.pythonPath
      ).catch(error => {
        this._setProgress(
          'Failed to create session',
          `<div class="message-row">${error}</div>
          <div class="message-row">
            <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowWelcomeView}')">Go to Welcome Page</a>
          </div>`,
          false
        );
      });
    });
  }

  handleOpenFilesOrFolders(fileOrFolders?: string[]) {
    const sessionConfig = SessionConfig.createLocalForFilesOrFolders(
      fileOrFolders
    );
    if (sessionConfig) {
      if (
        this._sessionConfig &&
        this._contentViewType === ContentViewType.Lab
      ) {
        // TODO: this shouldn't happen anymore since sessions are launched in new empty window. remove after testing
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          message: 'Replace existing session',
          detail:
            'Opening the files will close the existing JupyterLab session. Would you like to continue?',
          buttons: ['Open', 'Cancel'],
          defaultId: 1,
          cancelId: 1
        });

        if (choice === 1) {
          return;
        }
      }

      this._disposeSession().then(() => {
        this._createSessionForLocal(
          sessionConfig.workingDirectory,
          sessionConfig.filesToOpen
        ).catch(error => {
          this._setProgress(
            'Failed to create session',
            `<div class="message-row">${error}</div>
            <div class="message-row">
              <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowWelcomeView}')">Go to Welcome Page</a>
            </div>`,
            false
          );
        });
      });
    }
  }

  private async _createSessionForLocal(
    workingDirectory?: string,
    filesToOpen?: string[],
    pythonPath?: string,
    recentSessionIndex?: number,
    useDefaultPythonEnv?: boolean
  ) {
    const sessionConfig = SessionConfig.createLocal(
      workingDirectory,
      filesToOpen
    );

    this._showProgressView('Creating new session');

    this._wsSettings = new WorkspaceSettings(sessionConfig.workingDirectory);

    if (pythonPath || useDefaultPythonEnv === true) {
      this._wsSettings.setValue(
        SettingType.pythonPath,
        pythonPath ? pythonPath : ''
      );
    }

    pythonPath = this._wsSettings.getValue(SettingType.pythonPath);

    if (pythonPath) {
      try {
        this._registry.addEnvironment(pythonPath);
      } catch (error) {
        let message = `Error! Python environment at '${pythonPath}' is not compatible.`;
        if (
          error?.type === PythonEnvResolveErrorType.RequirementsNotSatisfied
        ) {
          const envPath = envPathForPythonPath(pythonPath);
          const requirementInstallCmd = encodeURIComponent(
            this._registry.getRequirementsInstallCommand(envPath)
          );
          message = `Error! Required packages not found in the Python environment. You can install using <copyable-span label="${requirementInstallCmd}" copied="${requirementInstallCmd}"></copyable-span> command in the selected environment.`;
        }

        this._showProgressView(
          'Invalid Environment configured for project',
          `<div class="message-row">${message}</div>
          ${
            error?.type === PythonEnvResolveErrorType.RequirementsNotSatisfied
              ? `<div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('${
                  EventTypeMain.InstallPythonEnvRequirements
                }', '${encodeURIComponent(
                  pythonPath
                )}')">Install the requirements for me</a></div>`
              : ''
          } 
        ${
          recentSessionIndex !== undefined
            ? `<div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.OpenRecentSessionWithDefaultEnv}', ${recentSessionIndex})">Reset to default Python environment</a></div>`
            : ''
        }
         <div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('${
           EventTypeMain.HideProgressView
         }')">Cancel</a></div>`,
          false
        );

        return;
      }
    }

    this._sessionConfig = sessionConfig;
    await this._createServerForSession();

    this._contentViewType = ContentViewType.Lab;
    this._updateContentView();

    this._updateSessionWindowPositionConfig();
    this._sessionConfigChanged.emit();

    if (filesToOpen) {
      this.labView.labUIReady.then(() => {
        this.labView.openFiles();
        this._hideProgressView();
      });
    } else {
      this._hideProgressView();
    }

    appData.addSessionToRecents({
      workingDirectory: sessionConfig.resolvedWorkingDirectory,
      filesToOpen: [...sessionConfig.filesToOpen]
    });
  }

  private _createSessionForRemoteUrl(
    remoteURL: string,
    persistSessionData: boolean,
    partition: string
  ) {
    this._showProgressView('Connecting to JupyterLab Server');

    try {
      this._sessionConfig = SessionConfig.createRemote(
        remoteURL,
        persistSessionData,
        partition
      );
      const sessionConfig = this._sessionConfig;

      appData.addRemoteURLToRecents(remoteURL);
      appData.addSessionToRecents({
        remoteURL,
        persistSessionData,
        partition: sessionConfig.partition
      });

      this._contentViewType = ContentViewType.Lab;
      this._updateContentView();
      this._hideProgressView();
      this._updateSessionWindowPositionConfig();
      this._sessionConfigChanged.emit();
    } catch (error) {
      this._setProgress(
        'Connection Error',
        `<div class="message-row">${error.message}</div>
        <div class="message-row">
          <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowWelcomeView}')">Go to Welcome Page</a>
        </div>`,
        false
      );
    }
  }

  private _createSessionForRecent(
    sessionIndex: number,
    useDefaultPythonEnv?: boolean
  ) {
    if (sessionIndex < 0 || sessionIndex >= appData.recentSessions.length) {
      return;
    }
    const recentSession = appData.recentSessions[sessionIndex];

    if (recentSession.remoteURL) {
      this._createSessionForRemoteUrl(
        recentSession.remoteURL,
        recentSession.persistSessionData,
        recentSession.partition
      );
    } else {
      let workingDirectoryExists = true;
      try {
        const stat = fs.statSync(recentSession.workingDirectory);
        if (!stat.isDirectory()) {
          workingDirectoryExists = false;
        }
      } catch (error) {
        workingDirectoryExists = false;
      }

      if (!workingDirectoryExists) {
        this._showProgressView(
          'Recent session load failed',
          `<div class="message-row">
          Working directory "${recentSession.workingDirectory}" does not exist anymore.
          </div>
          <div class="message-row">
            <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.DeleteRecentSession}', ${sessionIndex}); sendMessageToMain('${EventTypeMain.ShowWelcomeView}');">Remove from recents</a>
          </div>
          <div class="message-row">
            <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.HideProgressView}')">Go to Welcome Page</a>
          </div>`,
          false
        );
        return;
      }

      this._createSessionForLocal(
        recentSession.workingDirectory,
        recentSession.filesToOpen,
        undefined,
        sessionIndex,
        useDefaultPythonEnv
      ).catch(error => {
        this._setProgress(
          'Failed to create session',
          `<div class="message-row">${error}</div>
          <div class="message-row">
            <a href="javascript:void(0);" onclick="sendMessageToMain('${EventTypeMain.ShowWelcomeView}')">Go to Welcome Page</a>
          </div>`,
          false
        );
      });
    }
  }

  private _showWelcomeView() {
    this._hideProgressView();

    this._contentViewType = ContentViewType.Welcome;
    this._updateContentView();
  }

  private _newWindow() {
    this._app.createNewEmptySession();
    // keep a free server up
    // launch server after a wait to prevent blocking UI
    setTimeout(() => {
      this._app.createFreeServersIfNeeded();
    }, 500);
  }

  private _closeSession() {
    const showWelcome = () => {
      this._contentViewType = ContentViewType.Welcome;
      this._updateContentView();
    };

    this._hideEnvSelectPopup();

    this._disposeSession().then(() => {
      showWelcome();
      this._sessionConfigChanged.emit();
      // keep a free server up
      setTimeout(() => {
        this._app.createFreeServersIfNeeded();
      }, 200);
    });
  }

  private async _handleFileOrFolderOpenSession(
    type: 'file' | 'folder' | 'either'
  ) {
    const openProperties = ['showHiddenFiles', 'noResolveAliases'];

    if (type === 'either' || type === 'file') {
      openProperties.push('openFile', 'multiSelections');
    }

    if (type === 'either' || type === 'folder') {
      openProperties.push('openDirectory', 'createDirectory');
    }

    const { filePaths } = await dialog.showOpenDialog({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      properties: openProperties,
      buttonLabel: 'Open'
    });
    if (filePaths.length > 0) {
      this.handleOpenFilesOrFolders(filePaths);
    }
  }

  private _wsSettings: WorkspaceSettings;
  private _isDarkTheme: boolean;
  private _sessionConfig: SessionConfig | undefined;
  private _window: BrowserWindow;
  private _titleBarView: TitleBarView;
  private _welcomeView: WelcomeView;
  private _progressView: ProgressView;
  private _progressViewVisible: boolean = false;
  private _labView: LabView;
  private _contentViewType: ContentViewType = ContentViewType.Welcome;
  private _serverFactory: IServerFactory;
  private _app: IApplication;
  private _registry: IRegistry;
  private _server: JupyterServerFactory.IFactoryItem;
  private _remoteServerSelectDialog: RemoteServerSelectDialog;
  private _envSelectPopup: PythonEnvironmentSelectPopup;
  private _envSelectPopupVisible: boolean = false;
  private _disposePromise: Promise<void>;
  private _sessionConfigChanged = new Signal<this, void>(this);
  private _evm = new EventManager();
  private _recentSessionRemovalByThis = false;
}

export namespace SessionWindow {
  export interface IOptions {
    app: IApplication;
    serverFactory: IServerFactory;
    registry: IRegistry;
    contentView: ContentViewType;
    sessionConfig?: SessionConfig;
    rect?: IRect;
  }
}
