// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  BrowserView,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MenuItemConstructorOptions
} from 'electron';
import * as fs from 'fs';
import { WelcomeView } from '../welcomeview/welcomeview';
import { LabView } from '../labview/labview';
import {
  DEFAULT_WIN_HEIGHT,
  DEFAULT_WIN_WIDTH,
  DEFAULT_WORKING_DIR,
  FrontEndMode,
  SettingType,
  userSettings,
  WorkspaceSettings
} from '../config/settings';
import { TitleBarView } from '../titlebarview/titlebarview';
import {
  clearSession,
  DarkThemeBGColor,
  isDarkTheme,
  LightThemeBGColor
} from '../utils';
import { IServerFactory, JupyterServer, JupyterServerFactory } from '../server';
import { IDisposable, IPythonEnvironment, IVersionContainer } from '../tokens';
import { IRegistry } from '../registry';
import { IApplication } from '../app';
import { PreferencesDialog } from '../preferencesdialog/preferencesdialog';
import { RemoteServerSelectDialog } from '../remoteserverselectdialog/remoteserverselectdialog';
import { connectAndGetServerInfo, IJupyterServerInfo } from '../connect';
import { PythonEnvironmentSelectPopup } from '../pythonenvselectpopup/pythonenvselectpopup';
import { AboutDialog } from '../aboutdialog/aboutdialog';
import { ProgressView } from '../progressview/progressview';
import { appData } from '../config/appdata';
import { SessionConfig } from '../config/sessionconfig';

export enum ContentViewType {
  Welcome = 'welcome',
  Lab = 'lab'
}

interface IServerInfo {
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
const defaultEnvSelectPopupHeight = 300;

export class SessionWindow implements IDisposable {
  constructor(options: SessionWindow.IOptions) {
    this._app = options.app;
    this._registry = options.registry;
    this._serverFactory = options.serverFactory;
    this._contentViewType = options.contentView;
    this._sessionConfig = options.sessionConfig;
    this._wsSettings = new WorkspaceSettings(
      this._sessionConfig?.workingDirectory || DEFAULT_WORKING_DIR
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

    const x = this._sessionConfig?.x || 0;
    const y = this._sessionConfig?.y || 0;
    const width = this._sessionConfig?.width || DEFAULT_WIN_WIDTH;
    const height = this._sessionConfig?.height || DEFAULT_WIN_HEIGHT;

    this._window = new BrowserWindow({
      x,
      y,
      width,
      height,
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

    if (
      this._sessionConfig?.x !== undefined &&
      this._sessionConfig?.y !== undefined
    ) {
      this._window.setBounds({
        x: this._sessionConfig.x,
        y: this._sessionConfig.y,
        height: this._sessionConfig.height,
        width: this._sessionConfig.width
      });
    }

    if (options.center !== false) {
      this._window.center();
    }
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

    if (
      userSettings.getValue(SettingType.frontEndMode) === FrontEndMode.ClientApp
    ) {
      const serverInfo = await connectAndGetServerInfo(
        this._sessionConfig.url.href,
        { showDialog: false }
      );
      if (serverInfo) {
        this._sessionConfig.pageConfig = serverInfo.pageConfig;
        this._sessionConfig.cookies = serverInfo.cookies;
      }
    }

    appData.addSessionToRecents({
      workingDirectory: this._sessionConfig.resolvedWorkingDirectory,
      filesToOpen: [...this._sessionConfig.filesToOpen]
    });
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
          this._sessionConfig.persistSessionData
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
            this._resizeViews();
          })
          .catch(error => {
            this._setProgress(
              'Failed to create session',
              `<div class="message-row">${error}</div>
          <div class="message-row">
            <a href="javascript:void(0);" onclick="sendMessageToMain('show-welcome-view')">Go to Welcome Page</a>
          </div>`,
              false
            );
          });
        this._resizeViews();
      }
    } else {
      this._updateContentView();
      this._resizeViews();
    }

    this._window.on('resize', () => {
      this._updateSessionWindowPositionConfig();
      this._resizeViews();
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

  dispose(): Promise<void> {
    if (this._disposePromise) {
      return this._disposePromise;
    }

    this._disposePromise = new Promise<void>(resolve => {
      this._disposeSession().then(() => {
        this._disposePromise = null;
        resolve();
      });
    });

    return this._disposePromise;
  }

  private _loadWelcomeView() {
    const welcomeView = new WelcomeView({ isDarkTheme: this._isDarkTheme });
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
          <a href="javascript:void(0);" onclick="sendMessageToMain('show-welcome-view')">Go to Welcome Page</a> 
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
  }

  get titleBarView(): TitleBarView {
    return this._titleBarView;
  }

  get labView(): LabView {
    return this._labView;
  }

  get contentView(): BrowserView {
    if (this._contentViewType === ContentViewType.Welcome) {
      return this._welcomeView?.view;
    } else {
      return this._labView?.view;
    }
  }

  get serverFactory(): IServerFactory {
    return this._serverFactory;
  }

  get registry(): IRegistry {
    return this._registry;
  }

  private _registerListeners() {
    this._window.on('close', async () => {
      await this.dispose();
    });

    ipcMain.on('minimize-window', event => {
      if (event.sender !== this._titleBarView.view.webContents) {
        return;
      }
      this._window.minimize();
    });

    ipcMain.on('maximize-window', event => {
      if (event.sender !== this._titleBarView.view.webContents) {
        return;
      }
      this._window.maximize();
    });

    ipcMain.on('restore-window', event => {
      if (event.sender !== this._titleBarView.view.webContents) {
        return;
      }
      this._window.unmaximize();
    });

    ipcMain.on('close-window', event => {
      if (event.sender !== this._titleBarView.view.webContents) {
        return;
      }
      this._window.close();
    });

    ipcMain.handle('get-server-info', event => {
      if (
        !(
          event.sender === this._titleBarView.view.webContents ||
          event.sender === this._labView.view.webContents
        )
      ) {
        return;
      }
      return this.getServerInfo();
    });

    ipcMain.on(
      'create-new-session',
      async (event, type: 'notebook' | 'blank') => {
        if (event.sender !== this.contentView.webContents) {
          return;
        }

        const loadLabView = () => {
          this._contentViewType = ContentViewType.Lab;
          this._updateContentView();
          this._resizeViews();
        };

        this._showProgressView('Creating new session');

        const sessionConfig = new SessionConfig();
        this._sessionConfig = sessionConfig;
        this._wsSettings = new WorkspaceSettings(
          sessionConfig.workingDirectory || DEFAULT_WORKING_DIR
        );
        try {
          await this._createServerForSession();
        } catch (error) {
          this._showProgressView(
            'Failed to create session!',
            `
            <div class="message-row">${error}</div>
            <div class="message-row">
              <a href="javascript:void(0);" onclick="sendMessageToMain('show-welcome-view')">Go to Welcome Page</a>
            </div>
            <div class="message-row">
              <a href="javascript:void(0);" onclick="sendMessageToMain('install-bundled-python-env')">Install / update Python environment using the bundled installer</a>
            </div>
            <div class="message-row">
              <a href="javascript:void(0);" onclick="sendMessageToMain('show-server-preferences')">Change the default Python environment</a>
            </div>
          `,
            false
          );
        }

        loadLabView();
        this._updateSessionWindowPositionConfig();
        appData.setLastSession(this._sessionConfig);

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

    ipcMain.on('open-file-or-folder', async event => {
      if (event.sender !== this.contentView.webContents) {
        return;
      }

      this._handleFileOrFolderOpenSession('either');
    });

    ipcMain.on('open-file', async event => {
      if (event.sender !== this.contentView.webContents) {
        return;
      }

      this._handleFileOrFolderOpenSession('file');
    });

    ipcMain.on('open-folder', async event => {
      if (event.sender !== this.contentView.webContents) {
        return;
      }

      this._handleFileOrFolderOpenSession('folder');
    });

    ipcMain.on('create-new-remote-session', event => {
      if (event.sender !== this.contentView.webContents) {
        return;
      }

      this._selectRemoteServerUrl();
    });

    ipcMain.on(
      'set-remote-server-options',
      (event, remoteUrl: string, persistSessionData: boolean) => {
        if (
          event.sender !== this._remoteServerSelectDialog.window.webContents
        ) {
          return;
        }

        this._remoteServerSelectDialog.window.close();
        this._remoteServerSelectDialog = null;

        this._createSessionForRemoteUrl(remoteUrl, persistSessionData);
      }
    );

    ipcMain.on('open-recent-session', (event, sessionIndex: number) => {
      if (event.sender !== this._welcomeView.view.webContents) {
        return;
      }

      this._createSessionForRecent(sessionIndex);
    });

    ipcMain.on('delete-recent-session', (event, sessionIndex: number) => {
      if (
        !(
          event.sender === this._welcomeView.view.webContents ||
          event.sender === this._progressView.view.view.webContents
        )
      ) {
        return;
      }

      appData.removeSessionFromRecents(sessionIndex);
    });

    ipcMain.on(
      'open-recent-session-with-default-env',
      (event, sessionIndex: number) => {
        if (event.sender !== this._progressView.view.view.webContents) {
          return;
        }

        this._createSessionForRecent(sessionIndex, true);
      }
    );

    ipcMain.on('open-dropped-files', (event, fileOrFolders: string[]) => {
      if (event.sender !== this._welcomeView.view.webContents) {
        return;
      }

      this.handleOpenFilesOrFolders(fileOrFolders);
    });

    ipcMain.on('show-env-select-popup', event => {
      if (
        !(
          event.sender === this._titleBarView.view.webContents ||
          event.sender === this._progressView.view.view.webContents
        )
      ) {
        return;
      }

      this._showEnvSelectPopup();
    });

    ipcMain.on('hide-env-select-popup', event => {
      if (
        !(
          this._envSelectPopup &&
          event.sender === this._envSelectPopup.view.view.webContents
        )
      ) {
        return;
      }

      this._hideEnvSelectPopup();
    });

    ipcMain.on('set-python-path', async (event, path) => {
      if (event.sender !== this._envSelectPopup.view.view.webContents) {
        return;
      }

      this._hideEnvSelectPopup();

      this._showProgressView(
        'Restarting server using the selected Python enviroment'
      );

      const env = this._registry.addEnvironment(path);

      if (!env) {
        this._showProgressView(
          'Invalid Environment',
          `<div class="message-row">Error! Python environment at '${path}' is not compatible.</div>
          <div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('show-env-select-popup')">Select another environment</a></div>
          <div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('hide-progress-view')">Cancel</a></div>`,
          false
        );

        return;
      }

      this._wsSettings.setValue(SettingType.pythonPath, path);
      this._sessionConfig.pythonPath = path;

      const loadLabView = () => {
        this._contentViewType = ContentViewType.Lab;
        this._updateContentView();
        this._resizeViews();
      };

      this._disposeSession().then(async () => {
        try {
          const sessionConfig = this._sessionConfig;
          const server = await this.serverFactory.createServer({
            workingDirectory: sessionConfig.resolvedWorkingDirectory,
            environment: env
          });
          this._server = server;
          await server.server.started;
          const serverInfo = server.server.info;
          sessionConfig.token = serverInfo.token;
          sessionConfig.url = serverInfo.url;
          sessionConfig.defaultKernel = serverInfo.environment.defaultKernel;
          loadLabView();

          this._hideProgressView();
        } catch (error) {
          this._setProgress(
            'Failed to create session',
            `<div class="message-row">${error}</div>
            <div class="message-row">
              <a href="javascript:void(0);" onclick="sendMessageToMain('show-welcome-view')">Go to Welcome Page</a>
            </div>`,
            false
          );
        }
      });
    });

    ipcMain.on('show-app-context-menu', event => {
      if (event.sender !== this._titleBarView.view.webContents) {
        return;
      }

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
            this._app.checkForUpdates('always');
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

      if (
        this._contentViewType === ContentViewType.Lab &&
        !this._progressViewVisible
      ) {
        template.unshift(
          {
            label: 'Close Session',
            click: () => {
              this._closeSession();
            }
          },
          { type: 'separator' }
        );
      }

      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        window: BrowserWindow.fromWebContents(event.sender)
      });
    });

    ipcMain.on('hide-progress-view', async event => {
      if (event.sender !== this._progressView.view.view.webContents) {
        return;
      }

      this._hideProgressView();
    });

    ipcMain.on('show-welcome-view', async event => {
      if (event.sender !== this._progressView.view.view.webContents) {
        return;
      }

      this._showWelcomeView();
    });

    ipcMain.on('show-server-preferences', async event => {
      if (event.sender !== this._progressView.view.view.webContents) {
        return;
      }

      this._showPreferencesDialog(PreferencesDialog.Tab.Server);
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

      if (
        userSettings.getValue(SettingType.frontEndMode) ===
        FrontEndMode.ClientApp
      ) {
        serverInfo.url = this._sessionConfig.url.href;
        serverInfo.pageConfig = this._sessionConfig.pageConfig;
      }

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
          url: this._sessionConfig.url.href
        };

        if (
          userSettings.getValue(SettingType.frontEndMode) ===
          FrontEndMode.ClientApp
        ) {
          serverInfo.pageConfig = this._sessionConfig.pageConfig;
        }

        return serverInfo;
      }
    }
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

  private _showPreferencesDialog(activateTab?: PreferencesDialog.Tab) {
    if (this._preferencesDialog) {
      this._preferencesDialog.window.focus();
      return;
    }

    const settings = this._wsSettings;

    const dialog = new PreferencesDialog(
      {
        isDarkTheme: this._isDarkTheme,
        startupMode: settings.getValue(SettingType.startupMode),
        theme: settings.getValue(SettingType.theme),
        syncJupyterLabTheme: settings.getValue(SettingType.syncJupyterLabTheme),
        showNewsFeed: settings.getValue(SettingType.showNewsFeed),
        frontEndMode: settings.getValue(SettingType.frontEndMode),
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
        activateTab: activateTab
      },
      this._registry
    );

    this._preferencesDialog = dialog;

    dialog.window.on('closed', () => {
      this._preferencesDialog = null;
    });

    dialog.load();
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

  private _showAboutDialog() {
    const dialog = new AboutDialog({ isDarkTheme: this._isDarkTheme });
    dialog.load();
  }

  private async _createEnvSelectPopup() {
    const envs = await this.registry.getEnvironmentList(false);

    this._envSelectPopup = new PythonEnvironmentSelectPopup({
      isDarkTheme: this._isDarkTheme,
      envs
    });

    this._envSelectPopup.load();
  }

  private async _showEnvSelectPopup() {
    if (this._envSelectPopupVisible) {
      return;
    }

    let currentPythonPath = this._wsSettings.getValue(SettingType.pythonPath);
    if (!currentPythonPath) {
      const defaultEnv = await this.registry.getDefaultEnvironment();
      if (defaultEnv) {
        currentPythonPath = defaultEnv.path;
      }
    }

    this._envSelectPopup.setCurrentPythonPath(currentPythonPath);

    this._window.addBrowserView(this._envSelectPopup.view.view);
    this._envSelectPopupVisible = true;
    this._resizeEnvSelectPopup();
    this._envSelectPopup.view.view.webContents.focus();
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

  handleOpenFilesOrFolders(fileOrFolders?: string[]) {
    const sessionConfig = SessionConfig.createLocalForFilesOrFolders(
      fileOrFolders
    );
    if (sessionConfig) {
      if (
        this._sessionConfig &&
        this._contentViewType === ContentViewType.Lab
      ) {
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
        this._wsSettings = new WorkspaceSettings(
          sessionConfig.workingDirectory || DEFAULT_WORKING_DIR
        );
        this._createSessionForConfig(sessionConfig).catch(error => {
          this._setProgress(
            'Failed to create session',
            `<div class="message-row">${error}</div>
            <div class="message-row">
              <a href="javascript:void(0);" onclick="sendMessageToMain('show-welcome-view')">Go to Welcome Page</a>
            </div>`,
            false
          );
        });
      });
    }
  }

  private async _createSessionForConfig(sessionConfig: SessionConfig) {
    const loadLabView = (sessionConfig: SessionConfig) => {
      this._sessionConfig = sessionConfig;
      this._contentViewType = ContentViewType.Lab;
      this._updateContentView();
      this._resizeViews();
    };

    this._showProgressView('Creating new session');

    const server = await this.serverFactory.createServer({
      workingDirectory: sessionConfig.workingDirectory
    });
    this._server = server;
    await server.server.started;
    const serverInfo = server.server.info;
    sessionConfig.token = serverInfo.token;
    sessionConfig.url = serverInfo.url;
    sessionConfig.defaultKernel = serverInfo.environment.defaultKernel;

    if (
      userSettings.getValue(SettingType.frontEndMode) === FrontEndMode.ClientApp
    ) {
      const serverInfo = await connectAndGetServerInfo(sessionConfig.url.href, {
        showDialog: false
      });
      if (serverInfo) {
        sessionConfig.pageConfig = serverInfo.pageConfig;
        sessionConfig.cookies = serverInfo.cookies;
      }
    }

    loadLabView(sessionConfig);
    this._updateSessionWindowPositionConfig();
    appData.setLastSession(this._sessionConfig);

    if (sessionConfig.filesToOpen) {
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

  private async _createSessionForLocal(
    workingDirectory?: string,
    filesToOpen?: string[],
    recentSessionIndex?: number,
    useDefaultPythonEnv?: boolean
  ) {
    const loadLabView = (sessionConfig: SessionConfig) => {
      this._sessionConfig = sessionConfig;
      this._contentViewType = ContentViewType.Lab;
      this._updateContentView();
      this._resizeViews();
    };

    const sessionConfig = SessionConfig.createLocal(
      workingDirectory,
      filesToOpen
    );

    this._showProgressView('Creating new session');

    this._wsSettings = new WorkspaceSettings(
      sessionConfig.workingDirectory || DEFAULT_WORKING_DIR
    );

    const serverOptions: JupyterServer.IOptions = {
      workingDirectory: sessionConfig.resolvedWorkingDirectory
    };

    if (useDefaultPythonEnv === true) {
      this._wsSettings.setValue(SettingType.pythonPath, '');
    }

    const pythonPath = this._wsSettings.getValue(SettingType.pythonPath);

    if (pythonPath) {
      const env = this._registry.addEnvironment(pythonPath);

      if (!env) {
        this._showProgressView(
          'Invalid Environment configured for workspace',
          `<div class="message-row">Error! Python environment at '${pythonPath}' is not compatible.</div>
          ${
            recentSessionIndex !== undefined
              ? `<div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('open-recent-session-with-default-env', ${recentSessionIndex})">Reset to default Python environment</a></div>`
              : ''
          }
          <div class="message-row"><a href="javascript:void(0);" onclick="sendMessageToMain('hide-progress-view')">Cancel</a></div>`,
          false
        );

        return;
      }

      serverOptions.environment = env;
    }

    const server = await this.serverFactory.createServer(serverOptions);
    this._server = server;
    await server.server.started;
    const serverInfo = server.server.info;
    sessionConfig.token = serverInfo.token;
    sessionConfig.url = serverInfo.url;
    sessionConfig.defaultKernel = serverInfo.environment.defaultKernel;

    if (
      userSettings.getValue(SettingType.frontEndMode) === FrontEndMode.ClientApp
    ) {
      const serverInfo = await connectAndGetServerInfo(sessionConfig.url.href, {
        showDialog: false
      });
      if (serverInfo) {
        sessionConfig.pageConfig = serverInfo.pageConfig;
        sessionConfig.cookies = serverInfo.cookies;
      }
    }

    loadLabView(sessionConfig);
    this._updateSessionWindowPositionConfig();
    appData.setLastSession(this._sessionConfig);

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
    persistSessionData: boolean
  ) {
    this._showProgressView('Connecting to JupyterLab Server');

    try {
      const url = new URL(remoteURL);
      const isLocalUrl =
        url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      const getServerInfo =
        !isLocalUrl ||
        userSettings.getValue(SettingType.frontEndMode) ===
          FrontEndMode.ClientApp;

      const fetchServerInfo = new Promise<IJupyterServerInfo>(
        (resolve, reject) => {
          if (getServerInfo) {
            connectAndGetServerInfo(remoteURL, { showDialog: !isLocalUrl })
              .then(serverInfo => {
                resolve({
                  pageConfig: serverInfo.pageConfig,
                  cookies: serverInfo.cookies
                });
              })
              .catch(reject);
          } else {
            resolve({
              pageConfig: undefined,
              cookies: []
            });
          }
        }
      );

      fetchServerInfo
        .then(serverInfo => {
          const token = url.searchParams.get('token');
          const pageConfig = serverInfo.pageConfig;
          const cookies = serverInfo.cookies;

          this._sessionConfig = SessionConfig.createRemote(
            remoteURL,
            persistSessionData
          );
          const sessionConfig = this._sessionConfig;
          sessionConfig.url = url;
          sessionConfig.token = token;
          sessionConfig.pageConfig = pageConfig;
          sessionConfig.cookies = cookies;

          appData.addRemoteURLToRecents(remoteURL);
          appData.addSessionToRecents({
            remoteURL,
            persistSessionData
          });

          this._contentViewType = ContentViewType.Lab;
          this._updateContentView();
          this._resizeViews();
          this._hideProgressView();
          this._updateSessionWindowPositionConfig();
          appData.setLastSession(this._sessionConfig);
        })
        .catch(error => {
          this._setProgress(
            'Connection Error',
            `<div class="message-row">${error.message}</div>
            <div class="message-row">
              <a href="javascript:void(0);" onclick="sendMessageToMain('show-welcome-view')">Go to Welcome Page</a>
            </div>`,
            false
          );
        });
    } catch (error) {
      this._setProgress(
        'Connection Error',
        `<div class="message-row">${error.message}</div>
        <div class="message-row">
          <a href="javascript:void(0);" onclick="sendMessageToMain('show-welcome-view')">Go to Welcome Page</a>
        </div>`,
        false
      );
    }
  }

  private _createSessionForRecent(
    sessionIndex: number,
    useDefaultPythonEnv?: boolean
  ) {
    const recentSession = appData.recentSessions[sessionIndex];

    if (recentSession.remoteURL) {
      this._createSessionForRemoteUrl(
        recentSession.remoteURL,
        recentSession.persistSessionData
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
            <a href="javascript:void(0);" onclick="sendMessageToMain('delete-recent-session', ${sessionIndex}); sendMessageToMain('show-welcome-view');">Remove from recents</a>
          </div>
          <div class="message-row">
            <a href="javascript:void(0);" onclick="sendMessageToMain('hide-progress-view')">Go to Welcome Page</a>
          </div>`,
          false
        );
        return;
      }

      this._createSessionForLocal(
        recentSession.workingDirectory,
        recentSession.filesToOpen,
        sessionIndex,
        useDefaultPythonEnv
      ).catch(error => {
        this._setProgress(
          'Failed to create session',
          `<div class="message-row">${error}</div>
          <div class="message-row">
            <a href="javascript:void(0);" onclick="sendMessageToMain('show-welcome-view')">Go to Welcome Page</a>
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
    this._resizeViews();
  }

  private _closeSession() {
    const showWelcome = () => {
      this._contentViewType = ContentViewType.Welcome;
      this._updateContentView();
      this._resizeViews();
    };

    this._hideEnvSelectPopup();

    this._disposeSession().then(() => {
      appData.setLastSession(null);
      showWelcome();
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
  private _preferencesDialog: PreferencesDialog;
  private _remoteServerSelectDialog: RemoteServerSelectDialog;
  private _envSelectPopup: PythonEnvironmentSelectPopup;
  private _envSelectPopupVisible: boolean = false;
  private _disposePromise: Promise<void>;
}

export namespace SessionWindow {
  export interface IOptions {
    app: IApplication;
    serverFactory: IServerFactory;
    registry: IRegistry;
    contentView: ContentViewType;
    sessionConfig?: SessionConfig;
    center?: boolean;
  }
}
