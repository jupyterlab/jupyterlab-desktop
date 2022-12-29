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
  DEFAULT_WIN_HEIGHT,
  DEFAULT_WIN_WIDTH,
  DEFAULT_WORKING_DIR,
  SessionConfig,
  SettingType,
  userSettings,
  WorkspaceSettings
} from '../settings';
import { TitleBarView } from '../titlebarview/titlebarview';
import { DarkThemeBGColor, isDarkTheme, LightThemeBGColor } from '../utils';
import { IServerFactory, JupyterServer, JupyterServerFactory } from '../server';
import * as fs from 'fs';
import * as path from 'path';
import { IDisposable } from '../disposable';
import { IPythonEnvironment } from '../tokens';
import { IRegistry } from '../registry';
import { IApplication } from '../app';
import { PreferencesDialog } from '../preferencesdialog/preferencesdialog';

export enum ContentViewType {
  Welcome = 'welcome',
  Lab = 'lab'
}

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
      backgroundColor: isDarkTheme(this._wsSettings.getValue(SettingType.theme))
        ? DarkThemeBGColor
        : LightThemeBGColor,
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

  load() {
    const titleBarView = new TitleBarView();
    this._window.addBrowserView(titleBarView.view);
    titleBarView.view.setBounds({ x: 0, y: 0, width: 1200, height: 100 });

    this._window.on('focus', () => {
      titleBarView.activate();
    });
    this._window.on('blur', () => {
      titleBarView.deactivate();
    });

    titleBarView.load();
    this._titleBarView = titleBarView;

    this._updateContentView();

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

    this._resizeViews();
  }

  dispose(): Promise<void> {
    if (!this._server?.server) {
      return Promise.resolve();
    }

    return this._server.server.stop();
  }

  private _loadWelcomeView() {
    const welcomeView = new WelcomeView(this);
    this._window.addBrowserView(welcomeView.view);
    welcomeView.view.setBounds({ x: 0, y: 100, width: 1200, height: 700 });

    welcomeView.load();

    this._welcomeView = welcomeView;
  }

  private _loadLabView() {
    const labView = new LabView(this, this._sessionConfig);
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
          event.sender === this._titleBarView.view.webContents
        )
      ) {
        return;
      }
      return this.getServerInfo();
    });

    ipcMain.handle('get-current-python-environment', event => {
      if (event.sender !== this._titleBarView.view.webContents) {
        return;
      }
      return this.getPythonEnvironment();
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

    ipcMain.on('connect-to-remote-session', event => {
      if (event.sender !== this.contentView.webContents) {
        return;
      }
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
            this._app.showAboutDialog();
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

  getServerInfo(): JupyterServer.IInfo {
    if (this._server?.server) {
      return this._server?.server.info;
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
    const titleBarHeight = 29;
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

    // invalidate to trigger repaint
    // TODO: on linux, electron 22 does not repaint properly after resize
    // check if fixed in newer versions
    setTimeout(() => {
      this._titleBarView.view.webContents.invalidate();
      this.contentView.webContents.invalidate();
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
      theme: settings.getValue(SettingType.theme),
      syncJupyterLabTheme: settings.getValue(SettingType.syncJupyterLabTheme),
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

  private _closeSession() {
    const showWelcome = () => {
      this._contentViewType = ContentViewType.Welcome;
      this._updateContentView();
      this._resizeViews();
    };

    if (this._server?.server) {
      this._server?.server.stop().then(() => {
        this._server = undefined;
        showWelcome();
      });
    } else {
      showWelcome();
    }
  }

  private async _handleFileOrFolderOpenSession(
    type: 'file' | 'folder' | 'either'
  ) {
    const loadLabView = (sessionConfig: SessionConfig) => {
      this._sessionConfig = sessionConfig;
      this._contentViewType = ContentViewType.Lab;
      this._updateContentView();
      this._resizeViews();
    };

    const openProperties = ['showHiddenFiles', 'noResolveAliases'];

    if (type === 'either' || type === 'file') {
      openProperties.push('openFile');
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
      const selectedPath = filePaths[0];
      const stat = fs.lstatSync(selectedPath);
      let sessionConfig: SessionConfig;
      if (stat.isFile()) {
        const workingDir = path.dirname(selectedPath);
        sessionConfig = SessionConfig.createLocal(workingDir, selectedPath);
      } else if (stat.isDirectory()) {
        sessionConfig = SessionConfig.createLocal(selectedPath);
      }

      const server = await this.serverFactory.createFreeServer({
        workingDirectory: sessionConfig.workingDirectory
      });
      this._server = server;
      await server.server.started;
      const serverInfo = server.server.info;
      sessionConfig.token = serverInfo.token;
      sessionConfig.url = serverInfo.url;
      loadLabView(sessionConfig);
      if (stat.isFile()) {
        this.labView.labUIReady.then(() => {
          this.labView.openFiles();
        });
      }
    }
  }

  private _wsSettings: WorkspaceSettings;
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
