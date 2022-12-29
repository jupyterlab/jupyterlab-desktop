const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => {
    return {
      platform: process.platform
    };
  },
  isDarkTheme: () => {
    return ipcRenderer.invoke('is-dark-theme');
  },
  setRemoteServerOptions: (url: string, persistSessionData: boolean) => {
    ipcRenderer.send('set-remote-server-options', url, persistSessionData);
  }
});

export {};
