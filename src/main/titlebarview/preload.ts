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
  }
});
