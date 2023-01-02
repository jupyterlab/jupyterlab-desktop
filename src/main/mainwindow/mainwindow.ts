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
import { WelcomeView } from '../welcomeview/welcomeview';
import { LabView } from '../labview/labview';
import {
  appData,
  DEFAULT_WIN_HEIGHT,
  DEFAULT_WIN_WIDTH,
  DEFAULT_WORKING_DIR,
  SessionConfig,
  SettingType,
  userSettings,
  WorkspaceSettings
} from '../settings';
import { TitleBarView } from '../titlebarview/titlebarview';
import {
  clearSession,
  DarkThemeBGColor,
  getBundledPythonPath,
  isDarkTheme,
  LightThemeBGColor
} from '../utils';
import { IServerFactory, JupyterServer, JupyterServerFactory } from '../server';
import { IDisposable } from '../disposable';
import {
  IEnvironmentType,
  IPythonEnvironment,
  IVersionContainer
} from '../tokens';
import { IRegistry } from '../registry';
import { IApplication } from '../app';
import { PreferencesDialog } from '../preferencesdialog/preferencesdialog';
import { RemoteServerSelectDialog } from '../remoteserverselectdialog/remoteserverselectdialog';
import { connectAndGetServerInfo } from '../connect';
import { PythonEnvironmentSelectPopup } from '../pythonenvselectpopup/pythonenvselectpopup';
import { AboutDialog } from '../aboutdialog/aboutdialog';

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
}

const titleBarHeight = 29;
const defaultEnvSelectPopupHeight = 300;

export class MainWindow implements IDisposable {
  constructor(options: MainWindow.IOptions) {
    this._app = options.app;
    this._registry = options.registry;
    this._serverFactory = options.serverFactory;
    this._contentViewType = options.contentView;
    this._sessionConfig = options.sessionConfig;
    this._wsSettings = new WorkspaceSettings(
      this._sessionConfig?.workingDirectory || DEFAULT_WORKING_DIR
    );
    // if a python path was specified, set it as workspace setting
    if (this._sessionConfig.pythonPath) {
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
    } else {
      this._window.center();
    }
    this._window.show();

    this._registerListeners();
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
      serverOptions.environment = {
        path: pythonPath,
        name: 'cli-env',
        type: IEnvironmentType.PATH,
        versions: {},
        default: false
      };
    }

    const server = await this.serverFactory.createFreeServer(serverOptions);
    this._server = server;
    await server.server.started;
    const serverInfo = server.server.info;
    this._sessionConfig.token = serverInfo.token;
    this._sessionConfig.url = serverInfo.url;

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
      width: 1200,
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
      this._createServerForSession().then(() => {
        this._updateContentView();
        if (this._sessionConfig.filesToOpen.length > 0) {
          this._labView.labUIReady.then(() => {
            this._labView.openFiles();
          });
        }
        this._resizeViews();
      });
    } else {
      this._updateContentView();
      this._resizeViews();
    }

    this._window.on('resize', () => {
      this._updateSessionWindowInfo();
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
      this._updateSessionWindowInfo();
    });
  }

  private _disposeSession(): Promise<void> {
    this._wsSettings.save();

    if (this._sessionConfig?.isRemote) {
      if (!this._sessionConfig.persistSessionData) {
        return clearSession(this._labView.view.webContents.session);
      } else {
        return Promise.resolve();
      }
    } else {
      if (!this._server?.server) {
        return Promise.resolve();
      }

      return new Promise<void>(resolve => {
        this._server.server.stop().then(() => {
          this._server = null;
          resolve();
        });
      });
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
    welcomeView.view.setBounds({ x: 0, y: 100, width: 1200, height: 700 });

    welcomeView.load();

    this._welcomeView = welcomeView;
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

    labView.load();

    this._labView = labView;

    this._labView.view.webContents.on('focus', () => {
      this._closeEnvSelectPopup();
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
      return this._welcomeView.view;
    } else {
      return this._labView.view;
    }
  }

  get serverFactory(): IServerFactory {
    return this._serverFactory;
  }

  get registry(): IRegistry {
    return this._registry;
  }

  private _registerListeners() {
    this._window.on('close', () => {
      this.dispose();
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

        const sessionConfig = new SessionConfig();

        const loadLabView = () => {
          this._sessionConfig = sessionConfig;
          this._contentViewType = ContentViewType.Lab;
          this._updateContentView();
          this._resizeViews();
        };

        if (type === 'notebook' || type === 'blank') {
          const server = await this.serverFactory.createServer();
          this._server = server;
          await server.server.started;
          const serverInfo = server.server.info;
          sessionConfig.token = serverInfo.token;
          sessionConfig.url = serverInfo.url;
          loadLabView();
          if (type === 'notebook') {
            this.labView.labUIReady.then(() => {
              this.labView.newNotebook();
            });
          }
          appData.addSessionToRecents({
            workingDirectory: sessionConfig.resolvedWorkingDirectory,
            filesToOpen: [...sessionConfig.filesToOpen]
          });
        }
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

    ipcMain.on('open-dropped-files', (event, fileOrFolders: string[]) => {
      if (event.sender !== this._welcomeView.view.webContents) {
        return;
      }

      this._handleOpenFilesOrFolders(fileOrFolders);
    });

    ipcMain.on('show-env-select-popup', event => {
      if (event.sender !== this._titleBarView.view.webContents) {
        return;
      }

      this._showEnvSelectPopup();
    });

    ipcMain.on('close-env-select-popup', event => {
      if (
        !(
          this._envSelectPopup &&
          event.sender === this._envSelectPopup.view.view.webContents
        )
      ) {
        return;
      }

      this._closeEnvSelectPopup();
    });

    ipcMain.on('set-python-path', async (event, path) => {
      if (event.sender !== this._envSelectPopup.view.view.webContents) {
        return;
      }

      this._wsSettings.setValue(SettingType.pythonPath, path);
      this._sessionConfig.pythonPath = path;

      this._closeEnvSelectPopup();

      this._closeSession();

      const loadLabView = () => {
        this._contentViewType = ContentViewType.Lab;
        this._updateContentView();
        this._resizeViews();
      };

      this._server.server.stop().then(async () => {
        const sessionConfig = this._sessionConfig;
        const server = await this.serverFactory.createServer({
          workingDirectory: sessionConfig.resolvedWorkingDirectory,
          environment: {
            path: path,
            name: 'user-selected',
            type: IEnvironmentType.CondaEnv,
            versions: {},
            default: false
          }
        });
        this._server = server;
        await server.server.started;
        const serverInfo = server.server.info;
        sessionConfig.token = serverInfo.token;
        sessionConfig.url = serverInfo.url;
        loadLabView();
      });
    });

    ipcMain.on('env-select-popup-height-updated', async (event, height) => {
      if (
        !(
          this._envSelectPopup &&
          event.sender === this._envSelectPopup.view.view.webContents
        )
      ) {
        return;
      }

      this._resizeEnvSelectPopup(height);
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

      if (this._contentViewType === ContentViewType.Lab) {
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
      return {
        type: 'remote',
        url: this._sessionConfig.remoteURL,
        persistSessionData: this._sessionConfig.persistSessionData
      };
    } else {
      if (this._server?.server) {
        const info = this._server?.server.info;
        return {
          type: 'local',
          environment: {
            name: info.environment.name,
            path: info.environment.path,
            versions: info.environment.versions
          },
          workingDirectory: info.workingDirectory
        };
      }
    }
  }

  private _updateContentView() {
    if (this._contentViewType === ContentViewType.Welcome) {
      this._titleBarView.showServerStatus(false);
      if (this._labView) {
        this._window.removeBrowserView(this._labView.view);
        this._labView = null;
      }
      this._loadWelcomeView();
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
    this.contentView.setBounds({
      x: 0,
      y: titleBarHeight,
      width: width,
      height: height - titleBarHeight
    });

    this._resizeEnvSelectPopup();

    // invalidate to trigger repaint
    // TODO: on linux, electron 22 does not repaint properly after resize
    // check if fixed in newer versions
    setTimeout(() => {
      this._titleBarView.view.webContents.invalidate();
      this.contentView.webContents.invalidate();
      if (this._envSelectPopup) {
        this._envSelectPopup.view.view.webContents.invalidate();
      }
    }, 200);
  }

  private _updateSessionWindowInfo() {
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

  private _showPreferencesDialog() {
    if (this._preferencesDialog) {
      this._preferencesDialog.window.focus();
      return;
    }

    const settings = this._wsSettings;

    const dialog = new PreferencesDialog({
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
      defaultPythonPath: userSettings.getValue(SettingType.pythonPath)
    });

    this._preferencesDialog = dialog;

    dialog.window.on('closed', () => {
      this._preferencesDialog = null;
    });

    dialog.load();
  }

  private _selectRemoteServerUrl() {
    this._remoteServerSelectDialog = new RemoteServerSelectDialog({
      isDarkTheme: this._isDarkTheme,
      parent: this._window,
      modal: true,
      remoteURL: '',
      persistSessionData: true
    });

    this._remoteServerSelectDialog.load();
  }

  private _showAboutDialog() {
    const dialog = new AboutDialog({ isDarkTheme: this._isDarkTheme });
    dialog.load();
  }

  private _showEnvSelectPopup() {
    this._closeEnvSelectPopup();

    this.registry.getCondaEnvironments().then((envs: IPythonEnvironment[]) => {
      this._envSelectPopup = new PythonEnvironmentSelectPopup({
        isDarkTheme: this._isDarkTheme,
        currentPythonPath: this._sessionConfig.pythonPath,
        bundledPythonPath: getBundledPythonPath(),
        envs
      });

      this._window.addBrowserView(this._envSelectPopup.view.view);

      this._resizeEnvSelectPopup();

      this._envSelectPopup.load();
      this._envSelectPopup.view.view.webContents.focus();
    });
  }

  private _resizeEnvSelectPopup(height?: number) {
    if (!this._envSelectPopup) {
      return;
    }

    const titleBarRect = this._titleBarView.view.getBounds();
    const popupWidth = 600;
    const paddingRight = process.platform === 'darwin' ? 33 : 127;
    const newHeight = Math.min(
      height || this._envSelectPopupHeight,
      defaultEnvSelectPopupHeight
    );
    this._envSelectPopupHeight = newHeight;

    this._envSelectPopup.view.view.setBounds({
      x: titleBarRect.width - paddingRight - popupWidth,
      y: titleBarRect.height,
      width: popupWidth,
      height: newHeight
    });
  }

  private _closeEnvSelectPopup() {
    if (!this._envSelectPopup) {
      return;
    }
    this._window.removeBrowserView(this._envSelectPopup.view.view);
    this._envSelectPopup = null;
  }

  private async _handleOpenFilesOrFolders(fileOrFolders?: string[]) {
    const sessionConfig = SessionConfig.createLocalForFilesOrFolders(
      fileOrFolders
    );
    if (sessionConfig) {
      this._createSessionForConfig(sessionConfig);
    }
  }

  private async _createSessionForConfig(sessionConfig: SessionConfig) {
    const loadLabView = (sessionConfig: SessionConfig) => {
      this._sessionConfig = sessionConfig;
      this._contentViewType = ContentViewType.Lab;
      this._updateContentView();
      this._resizeViews();
    };

    const server = await this.serverFactory.createFreeServer({
      workingDirectory: sessionConfig.workingDirectory
    });
    this._server = server;
    await server.server.started;
    const serverInfo = server.server.info;
    sessionConfig.token = serverInfo.token;
    sessionConfig.url = serverInfo.url;

    loadLabView(sessionConfig);

    if (sessionConfig.filesToOpen) {
      this.labView.labUIReady.then(() => {
        this.labView.openFiles();
      });
    }

    appData.addSessionToRecents({
      workingDirectory: sessionConfig.resolvedWorkingDirectory,
      filesToOpen: [...sessionConfig.filesToOpen]
    });
  }

  private async _createSessionForLocal(
    workingDirectory?: string,
    filesToOpen?: string[]
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

    const server = await this.serverFactory.createFreeServer({
      workingDirectory: sessionConfig.workingDirectory
    });
    this._server = server;
    await server.server.started;
    const serverInfo = server.server.info;
    sessionConfig.token = serverInfo.token;
    sessionConfig.url = serverInfo.url;

    loadLabView(sessionConfig);

    if (filesToOpen) {
      this.labView.labUIReady.then(() => {
        this.labView.openFiles();
      });
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
    try {
      const url = new URL(remoteURL);
      connectAndGetServerInfo(remoteURL, { showDialog: true })
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
        })
        .catch(error => {
          dialog.showMessageBox({
            message: 'Failed to connect!',
            detail: error.message,
            type: 'error'
          });
        });
    } catch (error) {
      dialog.showMessageBox({
        message: 'Failed to connect!',
        detail: error.message,
        type: 'error'
      });
    }
  }

  private _createSessionForRecent(sessionIndex: number) {
    const recentSession = appData.recentSessions[sessionIndex];

    if (recentSession.remoteURL) {
      this._createSessionForRemoteUrl(
        recentSession.remoteURL,
        recentSession.persistSessionData
      );
    } else {
      this._createSessionForLocal(
        recentSession.workingDirectory,
        recentSession.filesToOpen
      );
    }
  }

  private _closeSession() {
    const showWelcome = () => {
      this._contentViewType = ContentViewType.Welcome;
      this._updateContentView();
      this._resizeViews();
    };

    this._disposeSession().then(() => {
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
      openProperties.push('openDirectory');
    }

    const { filePaths } = await dialog.showOpenDialog({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      properties: openProperties,
      buttonLabel: 'Open'
    });
    if (filePaths.length > 0) {
      this._handleOpenFilesOrFolders(filePaths);
    }
  }

  private _wsSettings: WorkspaceSettings;
  private _isDarkTheme: boolean;
  private _sessionConfig: SessionConfig | undefined;
  private _window: BrowserWindow;
  private _titleBarView: TitleBarView;
  private _welcomeView: WelcomeView;
  private _labView: LabView;
  private _contentViewType: ContentViewType = ContentViewType.Welcome;
  private _serverFactory: IServerFactory;
  private _app: IApplication;
  private _registry: IRegistry;
  private _server: JupyterServerFactory.IFactoryItem;
  private _preferencesDialog: PreferencesDialog;
  private _remoteServerSelectDialog: RemoteServerSelectDialog;
  private _envSelectPopup: PythonEnvironmentSelectPopup;
  private _envSelectPopupHeight: number = defaultEnvSelectPopupHeight;
  private _disposePromise: Promise<void>;
}

export namespace MainWindow {
  export interface IOptions {
    app: IApplication;
    serverFactory: IServerFactory;
    registry: IRegistry;
    contentView: ContentViewType;
    sessionConfig?: SessionConfig;
  }
}
