import { BrowserWindow, Cookie } from 'electron';

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

    window.setMenuBarVisibility(false);
    window.center();
    window.loadURL(url);

    window.webContents.on('did-navigate', (event: Event, navigationUrl) => {
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
    });
  });
}
