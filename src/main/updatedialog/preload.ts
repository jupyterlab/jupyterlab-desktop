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
  closeWindow: () => {
    ipcRenderer.send('close-active-window');
  },
  setCheckForUpdatesAutomatically: (check: boolean) => {
    ipcRenderer.send('set-check-for-updates-automatically', check);
  },
  setInstallUpdatesAutomatically: (install: boolean) => {
    ipcRenderer.send('set-install-updates-automatically', install);
  },
  launchInstallerDownloadPage: () => {
    ipcRenderer.send('launch-installer-download-page');
  }
});

export {};
