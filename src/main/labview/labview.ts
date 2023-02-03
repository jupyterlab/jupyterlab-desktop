// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  BrowserView,
  clipboard,
  Menu,
  MenuItemConstructorOptions
} from 'electron';
import log from 'electron-log';
import { request as httpRequest, IncomingMessage } from 'http';
import { request as httpsRequest } from 'https';
import * as path from 'path';
import * as fs from 'fs';
import * as ejs from 'ejs';
import {
  clearSession,
  DarkThemeBGColor,
  isDarkTheme,
  LightThemeBGColor
} from '../utils';
import { SessionWindow } from '../sessionwindow/sessionwindow';
import {
  FrontEndMode,
  SettingType,
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

// file name to variables map
const templateAssetPaths = new Map([
  [
    'index.html',
    (sessionConfig: SessionConfig) => {
      return {
        pageConfig: JSON.stringify(sessionConfig.pageConfig)
      };
    }
  ]
]);

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

    if (
      this._wsSettings.getValue(SettingType.frontEndMode) ===
        FrontEndMode.ClientApp &&
      this._sessionConfig.cookies
    ) {
      this._sessionConfig.cookies.forEach((cookie: any) => {
        this._cookies.set(cookie.name, `${cookie.name}=${cookie.value}`);
      });
    }

    if (!this._sessionConfig.isRemote) {
      this._evm.registerEventHandler(EventTypeMain.LabUIReady, event => {
        if (event.sender !== this._view.webContents) {
          return;
        }

        this._labUIReady = true;
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
      (event: Electron.Event, errorCode: number, errorDescription: string) => {
        if (errorCallback) {
          errorCallback(errorCode, errorDescription);
        }
      }
    );

    if (
      this._wsSettings.getValue(SettingType.frontEndMode) ===
      FrontEndMode.WebApp
    ) {
      this._view.webContents.loadURL(sessionConfig.url.href);
    } else {
      this._view.webContents.loadURL(
        `${this.jlabBaseUrl}/${DESKTOP_APP_ASSETS_PATH}/index.html`
      );
    }
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

  async openFiles() {
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
    this._unregisterBrowserEventHandlers();

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

    if (
      this._wsSettings.getValue(SettingType.frontEndMode) == FrontEndMode.WebApp
    ) {
      this._registerWebAppFrontEndHandlers();
    } else {
      this._registerClientAppFrontEndHandlers();
    }
  }

  private _unregisterBrowserEventHandlers() {
    if (
      this._wsSettings.getValue(SettingType.frontEndMode) ==
      FrontEndMode.ClientApp
    ) {
      this._view.webContents.session.protocol.uninterceptProtocol('http');
      this._view.webContents.session.protocol.uninterceptProtocol('https');
    }
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
      this._view.webContents.executeJavaScript(`
        // disable splash animation
        const style = document.createElement('style');
        style.textContent = '#jupyterlab-splash { display: none !important; }';
        document.head.append(style);

        async function getLab() {
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

        getLab().then((lab) => {
          lab.restored.then(() => {
            window.electronAPI.broadcastLabUIReady();
          });
        });
      `);
    });
  }

  private _registerClientAppFrontEndHandlers() {
    const sessionConfig = this._sessionConfig;
    this._view.webContents.session.protocol.interceptBufferProtocol(
      'http',
      this._handleInterceptBufferProtocol.bind(this)
    );

    this._view.webContents.session.protocol.interceptBufferProtocol(
      'https',
      this._handleInterceptBufferProtocol.bind(this)
    );

    const filter = {
      urls: [
        `ws://${sessionConfig.url.host}/*`,
        `wss://${sessionConfig.url.host}/*`
      ]
    };

    this._view.webContents.session.webRequest.onBeforeSendHeaders(
      filter,
      (details, callback) => {
        const requestHeaders: Record<string, string> = {
          ...details.requestHeaders
        };

        if (
          this._cookies.size > 0 &&
          new URL(details.url).host === this._sessionConfig.url.host
        ) {
          requestHeaders['Cookie'] = Array.from(this._cookies.values()).join(
            '; '
          );
          requestHeaders['Host'] = sessionConfig.url.host;
          requestHeaders['Origin'] = sessionConfig.url.origin;
        }
        callback({ cancel: false, requestHeaders });
      }
    );
  }

  private _handleInterceptBufferProtocol(
    req: Electron.ProtocolRequest,
    callback: (response: Buffer | Electron.ProtocolResponse) => void
  ): void {
    if (req.url.startsWith(this.desktopAppAssetsPrefix)) {
      this._handleDesktopAppAssetRequest(req, callback);
    } else {
      this._handleRemoteAssetRequest(req, callback);
    }
  }

  private _handleDesktopAppAssetRequest(
    req: Electron.ProtocolRequest,
    callback: (response: Buffer | Electron.ProtocolResponse) => void
  ): void {
    let assetPath = req.url.substring(this.desktopAppAssetsPrefix.length + 1);
    const qMark = assetPath.indexOf('?');
    if (qMark !== -1) {
      assetPath = assetPath.substring(0, qMark);
    }
    const assetFilePath = path.normalize(
      path.join(this.appAssetsDir, assetPath)
    );

    // make sure asset is in appAssetsDir, prevent access to lower level directories
    if (assetFilePath.indexOf(this.appAssetsDir) === 0) {
      if (!fs.existsSync(assetFilePath)) {
        callback({ statusCode: 404 });
        return;
      }
      let assetContent = fs.readFileSync(assetFilePath);
      if (templateAssetPaths.has(assetPath)) {
        assetContent = Buffer.from(
          ejs.render(
            assetContent.toString(),
            templateAssetPaths.get(assetPath)(this._sessionConfig)
          )
        );
      }

      callback(assetContent);
    }
  }

  private _handleRemoteAssetRequest(
    req: Electron.ProtocolRequest,
    callback: (response: Buffer | Electron.ProtocolResponse) => void
  ): void {
    const sessionConfig = this._sessionConfig;
    const headers: any = {
      ...req.headers,
      Referer: req.referrer,
      Authorization: `token ${sessionConfig.token}`
    };

    if (
      sessionConfig.url &&
      req.url.startsWith(
        `${sessionConfig.url.protocol}//${sessionConfig.url.host}`
      )
    ) {
      let cookieArray: string[] = [];
      if (sessionConfig.cookies) {
        sessionConfig.cookies.forEach((cookie: any) => {
          if (cookie.domain === sessionConfig.url.hostname) {
            cookieArray.push(`${cookie.name}=${cookie.value}`);
            if (cookie.name === '_xsrf') {
              headers['X-XSRFToken'] = cookie.value;
            }
          }
        });
      }
      headers['Cookie'] = cookieArray.join('; ');
    }

    const remoteUrl = req.url;
    const requestFn = remoteUrl.startsWith('https')
      ? httpsRequest
      : httpRequest;

    const request = requestFn(remoteUrl, {
      headers: headers,
      method: req.method
    });
    request.on('response', (res: IncomingMessage) => {
      if (req.url.startsWith(this.jlabBaseUrl) && 'set-cookie' in res.headers) {
        for (let cookie of res.headers['set-cookie']) {
          const cookieName = this._parseCookieName(cookie);
          if (cookieName) {
            this._cookies.set(cookieName, cookie);
          }
        }
      }

      const chunks: Buffer[] = [];

      res.on('data', (chunk: any) => {
        chunks.push(Buffer.from(chunk));
      });

      res.on('end', async () => {
        const file = Buffer.concat(chunks);
        callback({
          statusCode: res.statusCode,
          headers: res.headers,
          method: res.method,
          url: res.url,
          data: file
        });
      });
    });

    if (req.uploadData) {
      req.uploadData.forEach(part => {
        if (part.bytes) {
          request.write(part.bytes);
        } else if (part.file) {
          request.write(fs.readFileSync(part.file));
        }
      });
    }

    request.end();
  }

  private _parseCookieName(cookie: string): string | undefined {
    const parts = cookie.split(';');
    if (parts.length < 1) {
      return undefined;
    }
    const firstPart = parts[0];
    const eqLoc = firstPart.indexOf('=');
    if (eqLoc === -1) {
      return undefined;
    }
    return firstPart.substring(0, eqLoc).trim();
  }

  private _view: BrowserView;
  private _parent: SessionWindow;
  private _sessionConfig: SessionConfig;
  private _cookies: Map<string, string> = new Map();
  private _jlabBaseUrl: string;
  private _wsSettings: WorkspaceSettings;
  private _labUIReady = false;
  private _evm = new EventManager();
}

export namespace LabView {
  export interface IOptions {
    isDarkTheme: boolean;
    parent: SessionWindow;
    sessionConfig: SessionConfig;
  }
}
