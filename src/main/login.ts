import { BrowserWindow, Cookie } from 'electron';
import { appConfig, clearSession } from './utils';

export let loginWindow: BrowserWindow;

export interface IJupyterServerInfo {
  cookies: Cookie[];
  pageConfig?: any;
}

export interface IRemoteServerLoginOptions {
  showDialog?: boolean;
  incognito?: boolean;
  timeout?: number;
}

export interface ILoginError {
  type: 'invalid-url' | 'timeout' | 'dismissed';
  message?: string;
}

export async function loginAndGetServerInfo(
  url: string,
  options?: IRemoteServerLoginOptions
): Promise<IJupyterServerInfo> {
  return new Promise<IJupyterServerInfo>((resolve, reject) => {
    try {
      new URL(url);
    } catch (error) {
      reject({
        type: 'invalid-url',
        message: error.message
      } as ILoginError);
      return;
    }

    const browserOptions: Electron.BrowserWindowConstructorOptions = {
      title: 'JupyterLab Remote Server Login',
      show: options?.showDialog === true
    };
    if (options?.incognito) {
      browserOptions.webPreferences = {
        partition: `partition-${Date.now()}`
      };
    }

    const window = new BrowserWindow(browserOptions);

    const timeout = options?.timeout || 30000;

    const loginTimeoutHandler = async () => {
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
      } as ILoginError);
    };

    let loginTimeout: NodeJS.Timeout;

    const resetLoginTimer = () => {
      clearTimeout(loginTimeout);
      loginTimeout = setTimeout(loginTimeoutHandler, timeout);
    };

    resetLoginTimer();

    loginWindow = window;

    window.webContents.on(
      'did-navigate',
      (
        event: Event,
        navigationUrl: string,
        httpResponseCode: number,
        httpStatusText: string
      ) => {
        if (httpResponseCode !== 200) {
          clearTimeout(loginTimeout);
          reject();
          return;
        }

        resetLoginTimer();

        if (navigationUrl.startsWith(url)) {
          window.webContents
            .executeJavaScript(
              `
            const config = document.getElementById('jupyter-config-data');
            JSON.parse(config ? config.textContent : '{}');
          `
            )
            .then((config: any) => {
              window.webContents.session.cookies
                .get({})
                .then(async cookies => {
                  clearTimeout(loginTimeout);

                  if (options?.incognito) {
                    await clearSession(window.webContents.session);
                  }

                  window.close();
                  resolve({
                    pageConfig: config,
                    cookies: cookies
                  });
                })
                .catch(error => {
                  console.log(error);
                });
            });
        }
      }
    );

    window.on('closed', () => {
      clearTimeout(loginTimeout);
      reject({
        type: 'dismissed',
        message: 'Window closed.'
      } as ILoginError);
    });

    window.setMenuBarVisibility(false);
    window.center();

    const clearUserSession = !appConfig.persistSessionData;

    if (clearUserSession) {
      clearSession(window.webContents.session).then(() => {
        window.loadURL(url);
      });
    } else {
      window.loadURL(url);
    }
  });
}
