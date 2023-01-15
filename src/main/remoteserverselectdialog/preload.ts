const { contextBridge, ipcRenderer } = require('electron');

type RunningServerListSetListener = (runningServers: string[]) => void;

let onRunningServerListSetListener: RunningServerListSetListener;

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
  },
  onRunningServerListSet: (callback: RunningServerListSetListener) => {
    onRunningServerListSetListener = callback;
  }
});

ipcRenderer.on('set-running-server-list', (event, runningServers: string[]) => {
  if (onRunningServerListSetListener) {
    onRunningServerListSetListener(runningServers);
  }
});

export {};
