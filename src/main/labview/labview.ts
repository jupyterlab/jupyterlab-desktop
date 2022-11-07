// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { app, BrowserView } from 'electron';
import { request as httpRequest, IncomingMessage } from 'http';
import { request as httpsRequest } from 'https';

import * as path from 'path';
import * as fs from 'fs';
import * as ejs from 'ejs';
import { appConfig } from '../utils';

const DESKTOP_APP_ASSETS_PATH = 'desktop-app-assets';

// file name to variables map
const templateAssetPaths = new Map([
  [
    'index.html',
    () => {
      return {
        appConfig: JSON.stringify({
          version: app.getVersion()
        }),
        pageConfig: JSON.stringify(appConfig.pageConfig)
      };
    }
  ]
]);

export interface IInfo {
  serverState: 'new' | 'local' | 'remote';
  platform: NodeJS.Platform;
  uiState: 'linux' | 'mac' | 'windows';
}

export class LabView {
  constructor(info: IInfo) {
    this._info = info;
    this._view = new BrowserView({
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        preload: path.join(__dirname, './preload.js')
      }
    });

    this._registerRequestHandlers();
  }

  public get view(): BrowserView {
    return this._view;
  }

  load() {
    this._view.webContents.loadURL(
      `${appConfig.url.protocol}//${appConfig.url.host}${
        appConfig.url.pathname
      }${DESKTOP_APP_ASSETS_PATH}/index.html?${encodeURIComponent(
        JSON.stringify(this._info)
      )}`
    );
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

  private _registerRequestHandlers() {
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
  private _info: IInfo;
  private _cookies: Map<string, string> = new Map();
  private _jlabBaseUrl = `${appConfig.url.protocol}//${appConfig.url.host}${appConfig.url.pathname}`;
}
