const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => {
    return {
      platform: process.platform
    };
  },
  showAppContextMenu: () => {
    ipcRenderer.send('show-app-context-menu');
  },
  closeWindow: () => {
    ipcRenderer.send('close-active-window');
  },
  isDarkTheme: () => {
    return ipcRenderer.invoke('is-dark-theme');
  },
  minimizeWindow: () => {
    ipcRenderer.send('minimize-window');
  },
  maximizeWindow: () => {
    ipcRenderer.send('maximize-window');
  },
  restoreWindow: () => {
    ipcRenderer.send('restore-window');
  },
  getServerInfo: () => {
    return ipcRenderer.invoke('get-server-info');
  },
  getCurrentPythonEnvironment: () => {
    return ipcRenderer.invoke('get-current-python-environment');
  },
  showServerConfigDialog: () => {
    ipcRenderer.send('show-server-config-dialog');
  }
});

export {};
