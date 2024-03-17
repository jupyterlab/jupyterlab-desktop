// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  BrowserView,
  clipboard,
  dialog,
  Menu,
  MenuItemConstructorOptions
} from 'electron';
import log from 'electron-log';
import * as path from 'path';
import * as fs from 'fs';
import {
  clearSession,
  DarkThemeBGColor,
  isDarkTheme,
  LightThemeBGColor
} from '../utils';
import { SessionWindow } from '../sessionwindow/sessionwindow';
import {
  CtrlWBehavior,
  SettingType,
  UIMode,
  userSettings,
  WorkspaceSettings
} from '../config/settings';
import { IDisposable } from '../tokens';
import { SessionConfig } from '../config/sessionconfig';
import { EventManager } from '../eventmanager';
import { EventTypeMain } from '../eventtypes';

export type ILoadErrorCallback = (
  errorCode: number,
  errorDescription: string
) => void;

const DESKTOP_APP_ASSETS_PATH = 'desktop-app-assets';

export class LabView implements IDisposable {
  constructor(options: LabView.IOptions) {
    this._parent = options.parent;
    this._sessionConfig = options.sessionConfig;
    const sessionConfig = this._sessionConfig;
    this._wsSettings = new WorkspaceSettings(sessionConfig.workingDirectory);
    this._jlabBaseUrl = `${sessionConfig.url.protocol}//${sessionConfig.url.host}${sessionConfig.url.pathname}`;
    /*
    using a dedicated partition causes PDF rendering issues (object blob in iframe).
    use temporary dedicated partition only for unpersisted remote connections
    */
    let partition = undefined;
    if (sessionConfig.isRemote) {
      if (sessionConfig.persistSessionData) {
        partition = sessionConfig.partition;
      } else {
        partition = `partition-${Date.now()}`;
      }
    }
    this._view = new BrowserView({
      webPreferences: {
        preload: path.join(__dirname, './preload.js'),
        partition
      }
    });

    this._view.setBackgroundColor(
      options.isDarkTheme ? DarkThemeBGColor : LightThemeBGColor
    );

    this._registerBrowserEventHandlers();
    this._addFallbackContextMenu();

    if (!this._sessionConfig.isRemote) {
      this._evm.registerEventHandler(EventTypeMain.LabUIReady, event => {
        if (event.sender !== this._view.webContents) {
          return;
        }

        this._labUIReady = true;
      });
    }

    const ctrlWBehavior = userSettings.getValue(SettingType.ctrlWBehavior);

    if (ctrlWBehavior !== CtrlWBehavior.CloseWindow) {
      this._view.webContents.on('before-input-event', async (event, input) => {
        if (
          input.code === 'KeyW' &&
          ((input.meta && process.platform === 'darwin') ||
            (input.control && process.platform !== 'darwin'))
        ) {
          let skipClose = false;

          if (ctrlWBehavior === CtrlWBehavior.CloseTab) {
            event.preventDefault();
            await this._view.webContents.executeJavaScript(`
              {
                const lab = window.jupyterapp || window.jupyterlab;
                if (lab) {
                  lab.commands.execute('application:close');
                }
              }
              0; // response
            `);
            skipClose = true;
          } else if (ctrlWBehavior === CtrlWBehavior.Warn) {
            const choice = dialog.showMessageBoxSync({
              type: 'warning',
              message: 'Do you want to close the session?',
              buttons: ['Close session', 'Cancel'],
              defaultId: 1,
              cancelId: 1
            });

            skipClose = choice === 1;
          } else {
            // CtrlWBehavior.DoNotClose
            skipClose = true;
          }

          if (skipClose) {
            event.preventDefault();
          }
        }
      });
    }
  }

  public get view(): BrowserView {
    return this._view;
  }

  load(errorCallback?: ILoadErrorCallback) {
    const sessionConfig = this._sessionConfig;

    this._view.webContents.once(
      'did-fail-load',
      (
        event: Electron.Event,
        errorCode: number,
        errorDescription: string,
        validatedURL: string,
        isMainFrame: boolean
      ) => {
        if (isMainFrame && errorCallback) {
          errorCallback(errorCode, errorDescription);
        } else {
          console.warn('Failed to load labview', errorDescription);
        }
      }
    );

    this._view.webContents.loadURL(sessionConfig.url.href);
  }

  get jlabBaseUrl(): string {
    return this._jlabBaseUrl;
  }

  get desktopAppAssetsPrefix(): string {
    return `${this.jlabBaseUrl}/${DESKTOP_APP_ASSETS_PATH}`;
  }

  get appAssetsDir(): string {
    return path.normalize(path.join(__dirname, '../../../'));
  }

  /**
   * if opening a single file and no workspace setting exists
   */
  shouldSetToSingleFileUIMode(): boolean {
    this._reloadWSSettings();

    // if UI mode not specified for project directory
    if (!this._wsSettings.hasValue(SettingType.uiMode)) {
      return this._willOpenSingleFile();
    }

    return false;
  }

  private _reloadWSSettings() {
    this._wsSettings = new WorkspaceSettings(
      this._sessionConfig.workingDirectory
    );
  }

  private _willOpenSingleFile(): boolean {
    const labDir = this._sessionConfig.resolvedWorkingDirectory;

    const filesToOpen = this._sessionConfig.filesToOpen;
    if (filesToOpen.length === 1) {
      const filePath = path.resolve(labDir, this._sessionConfig.filesToOpen[0]);
      if (fs.lstatSync(filePath)?.isFile()) {
        return true;
      }
    }

    return false;
  }

  async openFiles() {
    if (this.shouldSetToSingleFileUIMode()) {
      this._setUIMode(
        userSettings.getValue(SettingType.uiModeForSingleFileOpen)
      );
    }

    const filesToOpen = this._sessionConfig.filesToOpen;
    filesToOpen.forEach(async (relPath: string) => {
      if (relPath === '') {
        return;
      }

      const labDir = this._sessionConfig.resolvedWorkingDirectory;
      const filePath = path.resolve(labDir, relPath);

      try {
        const stats = fs.lstatSync(filePath);
        if (stats.isFile()) {
          await this._view.webContents.executeJavaScript(`
            {
              const lab = window.jupyterapp || window.jupyterlab;
              if (lab) {
                lab.commands.execute('docmanager:open', { path: '${relPath}' });
              }
            }
            0; // response
          `);
        } else {
          log.error(`Valid file not found at path: ${path}`);
        }
      } catch (error) {
        log.error(`Failed to open file at path: ${path}. Error: `, error);
      }
    });
  }

  async newNotebook() {
    try {
      await this._view.webContents.executeJavaScript(`
        {
          const lab = window.jupyterapp || window.jupyterlab;
          if (lab) {
            const commands = lab.commands;
            commands.execute('docmanager:new-untitled', {
              type: 'notebook'
            }).then((model) => {
              if (model != undefined) {
                commands.execute('docmanager:open', {
                  path: model.path,
                  factory: 'Notebook',
                  kernel: { name: '${this._sessionConfig.defaultKernel}' }
                });
              }
            });
          }
        }
        0; // response
      `);
    } catch (error) {
      log.error(`Failed to create new notebook. Error: `, error);
    }
  }

  get uiMode(): UIMode {
    return this._uiMode;
  }

  async setUIMode(uiMode: UIMode) {
    if (uiMode === UIMode.ManagedByWebApp) {
      this._uiMode = uiMode;
      // let web app control the layout
      return;
    }

    await this._setUIMode(uiMode);
  }

  private async _setUIMode(uiMode: UIMode) {
    this._uiMode = uiMode;

    await this._view.webContents.executeJavaScript(`
    {
      jlabDesktop_setUIMode('${this._uiMode}', {
        showTOCInZenMode: ${userSettings.getValue(SettingType.showTOCInZenMode)}
      });
    }
  `);
  }

  get labUIReady(): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const checkIfReady = () => {
        if (this._labUIReady) {
          resolve(true);
        } else {
          setTimeout(() => {
            checkIfReady();
          }, 100);
        }
      };

      checkIfReady();
    });
  }

  dispose(): Promise<void> {
    this._evm.dispose();

    // if local or remote with no data persistence, clear session data
    if (
      this._sessionConfig.isRemote &&
      !this._sessionConfig.persistSessionData
    ) {
      if (!this._parent.window.isDestroyed()) {
        return clearSession(this._view.webContents.session);
      } else {
        return Promise.resolve();
      }
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Simple fallback context menu shown on Shift + Right Click.
   * May be removed in future versions once (/if) JupyterLab builtin menu
   * supports cut/copy/paste, including "Copy link URL" and "Copy image".
   * @private
   */
  private _addFallbackContextMenu(): void {
    const selectionTemplate: MenuItemConstructorOptions[] = [{ role: 'copy' }];

    const inputMenu = Menu.buildFromTemplate([
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]);

    this._view.webContents.on('context-menu', (event, params) => {
      const window = this._parent.window;
      if (params.isEditable) {
        inputMenu.popup({ window });
      } else {
        const template: MenuItemConstructorOptions[] = [];
        if (params.selectionText) {
          template.push(...selectionTemplate);
        }
        if (params.linkURL) {
          template.push({
            label: 'Copy link URL',
            click: () => {
              clipboard.writeText(params.linkURL);
            }
          });
        }
        if (params.hasImageContents) {
          template.push({
            label: 'Copy image',
            click: () => {
              this._view.webContents.copyImageAt(params.x, params.y);
            }
          });
        }
        if (template.length) {
          Menu.buildFromTemplate(template).popup({ window });
        }
      }
    });
  }

  private _registerBrowserEventHandlers() {
    this._view.webContents.on(
      'console-message',
      (event: Electron.Event, level: number, message: string) => {
        switch (level) {
          case 0:
            log.verbose(message);
            break;
          case 1:
            log.info(message);
            break;
          case 2:
            log.warn(message);
            break;
          case 3:
            log.error(message);
            break;
        }
      }
    );

    if (this._wsSettings.getValue(SettingType.syncJupyterLabTheme)) {
      this._evm.registerEventHandler(EventTypeMain.LabUIReady, event => {
        if (event.sender !== this._view.webContents) {
          return;
        }
        this._setJupyterLabTheme(this._wsSettings.getValue(SettingType.theme));
      });
    }

    this._evm.registerEventHandler(
      EventTypeMain.SetTheme,
      async (_event, theme) => {
        if (this._wsSettings.getValue(SettingType.syncJupyterLabTheme)) {
          await this._setJupyterLabTheme(theme);
        }
      }
    );

    this._registerWebAppFrontEndHandlers();
  }

  private async _setJupyterLabTheme(theme: string) {
    const themeName = isDarkTheme(theme)
      ? 'JupyterLab Dark'
      : 'JupyterLab Light';

    await this._view.webContents.executeJavaScript(`
      {
        const lab = window.jupyterapp || window.jupyterlab;
        if (lab) {
          const existingTheme = document.body.dataset?.jpThemeName;
          const newTheme = '${themeName}';
          if (existingTheme !== newTheme) {
            lab.commands.execute('apputils:change-theme', { theme: newTheme });
          }
        }
      }
      0; // response
    `);
  }

  private _registerWebAppFrontEndHandlers() {
    this._view.webContents.on('dom-ready', () => {
      const setToSingleFileUIMode = this.shouldSetToSingleFileUIMode();

      this._view.webContents.executeJavaScript(`
        // disable splash animation
        {
          const style = document.createElement('style');
          style.textContent = '#jupyterlab-splash * { display: none; }';
          document.head.append(style);
        }

        async function jlabDesktop_getLab() {
          return new Promise((resolve) => {
            const checkLab = () => {
              return window.jupyterapp || window.jupyterlab;
            };
      
            const lab = checkLab();
            if (lab) {
              resolve(lab);
            }
            let timer = setInterval(() => {
              const lab = checkLab();
              if (lab) {
                clearTimeout(timer);
                resolve(lab);
              }
            }, 200);
          });
        }

        async function jlabDesktop_setUIMode(uiMode, options) {
          const lab = await jlabDesktop_getLab();
          const labShell = lab.shell;
          const statusBar = labShell.widgets('bottom').find(widget => widget.id === 'jp-main-statusbar');
          const currentState = {
            leftTabBarVisible: labShell.isSideTabBarVisible('left'),
            leftCollapsed: labShell.leftCollapsed,
            rightTabBarVisible: labShell.isSideTabBarVisible('right'),
            rightCollapsed: labShell.rightCollapsed,
            isSimpleInterface: labShell.mode === 'single-document',
            statusBarVisible: statusBar && statusBar.isVisible,
          };
  
          if (uiMode === '${UIMode.MultiDocument}' || uiMode === '${
        UIMode.SingleDocument
      }') {
            labShell.mode = uiMode === '${
              UIMode.MultiDocument
            }' ? 'multiple-document' : 'single-document';
            if (currentState.leftCollapsed) {
              labShell.expandLeft();
            }
            if (!currentState.leftTabBarVisible) {
              labShell.toggleSideTabBarVisibility('left');
            }
            if (!currentState.rightCollapsed) {
              labShell.collapseRight();
            }
            if (!currentState.rightTabBarVisible) {
              labShell.toggleSideTabBarVisibility('right');
            }
            if (statusBar) {
              statusBar.setHidden(false);
            }
          } else if (uiMode === '${UIMode.Zen}') {
            if (!currentState.leftCollapsed) {
              labShell.collapseLeft();
            }
            if (currentState.leftTabBarVisible) {
              labShell.toggleSideTabBarVisibility('left');
            }
            if (!currentState.rightCollapsed) {
              labShell.collapseRight();
            }
            if (currentState.rightTabBarVisible) {
              labShell.toggleSideTabBarVisibility('right');
            }
            if (!currentState.isSimpleInterface) {
              labShell.mode = 'single-document';
            }
            if (currentState.statusBarVisible) {
              if (statusBar) {
                statusBar.setHidden(true);
              }
            }
            if (options?.showTOCInZenMode) {
              labShell.activateById('table-of-contents');
            }
          }
        }

        jlabDesktop_getLab().then((lab) => {
          ${
            setToSingleFileUIMode
              ? `jlabDesktop_setUIMode(
                  '${userSettings.getValue(
                    SettingType.uiModeForSingleFileOpen
                  )}', {
                    showTOCInZenMode: ${userSettings.getValue(
                      SettingType.showTOCInZenMode
                    )}
                  });`
              : ''
          }
          lab.restored.then(() => {
            window.electronAPI.broadcastLabUIReady();
          });
        });
      `);
    });
  }

  private _view: BrowserView;
  private _parent: SessionWindow;
  private _sessionConfig: SessionConfig;
  private _jlabBaseUrl: string;
  private _wsSettings: WorkspaceSettings;
  private _labUIReady = false;
  private _evm = new EventManager();
  private _uiMode: UIMode = UIMode.ManagedByWebApp;
}

export namespace LabView {
  export interface IOptions {
    isDarkTheme: boolean;
    parent: SessionWindow;
    sessionConfig: SessionConfig;
  }
}
