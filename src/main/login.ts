import { BrowserWindow, Cookie } from 'electron';
import { appConfig, clearSession } from './utils';

export let loginWindow: BrowserWindow;

export interface IJupyterServerInfo {
  cookies: Cookie[];
  pageConfig?: any;
}

export async function loginAndGetServerInfo(
  url: string,
  showDialog: boolean = true
): Promise<IJupyterServerInfo> {
  return new Promise<IJupyterServerInfo>((resolve, reject) => {
    const window = new BrowserWindow({
      show: showDialog,
      title: 'JupyterLab Remote Server Login'
    });

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
          reject();
          return;
        }
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
                .then(cookies => {
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

    window.setMenuBarVisibility(false);
    window.center();

    const clearUserSession = !appConfig.isRemote;

    if (clearUserSession) {
      clearSession(window.webContents).then(() => {
        window.loadURL(url);
      });
    } else {
      window.loadURL(url);
    }
  });
}
