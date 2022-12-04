// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  BrowserView,
  clipboard,
  ipcMain,
  Menu,
  MenuItemConstructorOptions
} from 'electron';
import log from 'electron-log';
import { request as httpRequest, IncomingMessage } from 'http';
import { request as httpsRequest } from 'https';

import * as path from 'path';
import * as fs from 'fs';
import * as ejs from 'ejs';
import { appConfig, getCurrentRootPath, isDarkTheme } from '../utils';
import { MainWindow } from '../mainwindow/mainwindow';

const DESKTOP_APP_ASSETS_PATH = 'desktop-app-assets';

// file name to variables map
const templateAssetPaths = new Map([
  [
    'index.html',
    () => {
      return {
        pageConfig: JSON.stringify(appConfig.pageConfig)
      };
    }
  ]
]);

export class LabView {
  constructor(parent: MainWindow, options: LabView.IOptions) {
    this._parent = parent;
    this._options = options;
    this._view = new BrowserView({
      webPreferences: {
        preload: path.join(__dirname, './preload.js')
      }
    });

    this._registerBrowserEventHandlers();
    this._addFallbackContextMenu();
  }

  public get view(): BrowserView {
    return this._view;
  }

  load() {
    if (appConfig.frontEndMode === 'web-app') {
      this._view.webContents.loadURL(`${appConfig.url.href}`);
    } else {
      this._view.webContents.loadURL(
        `${appConfig.url.protocol}//${appConfig.url.host}${
          appConfig.url.pathname
        }${DESKTOP_APP_ASSETS_PATH}/index.html?${encodeURIComponent(
          JSON.stringify(this._options)
        )}`
      );
    }
  }

  get jlabBaseUrl(): string {
    return this._jlabBaseUrl;
  }

  get desktopAppAssetsPrefix(): string {
    return `${this.jlabBaseUrl}${DESKTOP_APP_ASSETS_PATH}`;
  }

  get appAssetsDir(): string {
    return path.normalize(path.join(__dirname, '../../../'));
  }

  async openFile(path: string): Promise<void> {
    try {
      const stats = fs.lstatSync(path);
      if (stats.isFile()) {
        const labDir = getCurrentRootPath();
        let relPath = path.replace(labDir, '');
        const winConvert = relPath.split('\\').join('/');
        relPath = winConvert.replace('/', '');

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

    if (appConfig.syncJupyterLabTheme) {
      ipcMain.once('lab-ui-ready', () => {
        this._setJupyterLabTheme(appConfig.theme);
      });
    }

    ipcMain.on('set-theme', async (_event, theme) => {
      if (appConfig.syncJupyterLabTheme) {
        await this._setJupyterLabTheme(theme);
      }
    });

    if (appConfig.frontEndMode == 'web-app') {
      this._registerWebAppFrontEndHandlers();
    } else {
      this._registerClientAppFrontEndHandlers();
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
    this._view.webContents.session.protocol.interceptBufferProtocol(
      'http',
      this._handleInterceptBufferProtocol.bind(this)
    );

    this._view.webContents.session.protocol.interceptBufferProtocol(
      'https',
      this._handleInterceptBufferProtocol.bind(this)
    );

    const filter = {
      urls: [`ws://${appConfig.url.host}/*`, `wss://${appConfig.url.host}/*`]
    };

    this._view.webContents.session.webRequest.onBeforeSendHeaders(
      filter,
      (details, callback) => {
        const requestHeaders: Record<string, string> = {
          ...details.requestHeaders
        };
        if (this._cookies.size > 0) {
          requestHeaders['Cookie'] = Array.from(this._cookies.values()).join(
            '; '
          );
          requestHeaders['Host'] = appConfig.url.host;
          requestHeaders['Origin'] = appConfig.url.origin;
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
            templateAssetPaths.get(assetPath)()
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
    const headers: any = {
      ...req.headers,
      Referer: req.referrer,
      Authorization: `token ${appConfig.token}`
    };

    if (
      appConfig.url &&
      req.url.startsWith(`${appConfig.url.protocol}//${appConfig.url.host}`)
    ) {
      let cookieArray: string[] = [];
      if (appConfig.cookies) {
        appConfig.cookies.forEach(cookie => {
          if (cookie.domain === appConfig.url.hostname) {
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
  private _parent: MainWindow;
  private _options: LabView.IOptions;
  private _cookies: Map<string, string> = new Map();
  private _jlabBaseUrl = `${appConfig.url.protocol}//${appConfig.url.host}${appConfig.url.pathname}`;
}

export namespace LabView {
  export interface IOptions {
    serverState: 'new' | 'local' | 'remote';
    platform: NodeJS.Platform;
    uiState: 'linux' | 'mac' | 'windows';
  }
}
