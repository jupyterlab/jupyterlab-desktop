// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserWindow, Cookie } from 'electron';
import { appConfig, clearSession } from './utils';

export let connectWindow: BrowserWindow;

export interface IJupyterServerInfo {
  cookies: Cookie[];
  pageConfig?: any;
}

export interface IRemoteServerConnectOptions {
  showDialog?: boolean;
  incognito?: boolean;
  timeout?: number;
}

export interface IConnectError {
  type: 'invalid-url' | 'timeout' | 'dismissed';
  message?: string;
}

export async function connectAndGetServerInfo(
  url: string,
  options?: IRemoteServerConnectOptions
): Promise<IJupyterServerInfo> {
  return new Promise<IJupyterServerInfo>((resolve, reject) => {
    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch (error) {
      reject({
        type: 'invalid-url',
        message: error.message
      } as IConnectError);
      return;
    }

    const browserOptions: Electron.BrowserWindowConstructorOptions = {
      title: 'JupyterLab Server Connection',
      show: options?.showDialog === true
    };
    if (options?.incognito) {
      browserOptions.webPreferences = {
        partition: `partition-${Date.now()}`
      };
    }

    const window = new BrowserWindow(browserOptions);

    const timeout = options?.timeout || 30000;

    const connectTimeoutHandler = async () => {
      if (window) {
        if (options?.incognito) {
          await clearSession(window.webContents.session);
        }
        window.close();
      }
      reject({
        type: 'timeout',
        message: `Failed to connect to JupyterLab server in ${(
          timeout / 1000
        ).toFixed(1)} s`
      } as IConnectError);
    };

    let connectTimeout: NodeJS.Timeout;

    const resetConnectTimer = () => {
      clearTimeout(connectTimeout);
      connectTimeout = setTimeout(connectTimeoutHandler, timeout);
    };

    resetConnectTimer();

    connectWindow = window;

    const urlPrefix = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

    window.webContents.on(
      'did-navigate',
      (
        event: Event,
        navigationUrl: string,
        httpResponseCode: number,
        httpStatusText: string
      ) => {
        if (httpResponseCode >= 400) {
          clearTimeout(connectTimeout);
          window.close();
          reject({
            type: 'invalid-url',
            message: `Server responded with code: ${httpResponseCode}`
          } as IConnectError);
          return;
        }

        resetConnectTimer();

        if (!navigationUrl.startsWith(urlPrefix)) {
          return;
        }

        window.webContents
          .executeJavaScript(
            `
            const config = document.getElementById('jupyter-config-data');
            JSON.parse(config ? config.textContent : '{}');
          `
          )
          .then((config: any) => {
            resetConnectTimer();

            if (!(config && config.appVersion)) {
              clearTimeout(connectTimeout);
              window.close();
              reject({
                type: 'invalid-url',
                message: 'Not a supported JupyterLab server found'
              } as IConnectError);
              return;
            }
            window.webContents.session.cookies
              .get({})
              .then(async cookies => {
                clearTimeout(connectTimeout);

                if (options?.incognito) {
                  await clearSession(window.webContents.session);
                }

                const hostname = urlObj.hostname;
                const domainCookies = cookies.filter(
                  cookie => cookie.domain === hostname
                );

                window.close();
                resolve({
                  pageConfig: config,
                  cookies: domainCookies
                });
              })
              .catch(error => {
                console.log(error);
              });
          });
      }
    );

    window.on('closed', () => {
      clearTimeout(connectTimeout);
      reject({
        type: 'dismissed',
        message: 'Window closed'
      } as IConnectError);
    });

    window.setMenuBarVisibility(false);
    window.center();

    const clearUserSession =
      !appConfig.persistSessionData || appConfig.clearSessionDataOnNextLaunch;

    if (clearUserSession) {
      clearSession(window.webContents.session).then(() => {
        window.loadURL(url);
      });
    } else {
      window.loadURL(url);
    }
  });
}
