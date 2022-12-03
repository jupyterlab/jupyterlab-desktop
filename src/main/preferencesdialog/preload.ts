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
  restartApp: () => {
    ipcRenderer.send('restart-app');
  },
  setCheckForUpdatesAutomatically: (check: boolean) => {
    ipcRenderer.send('set-check-for-updates-automatically', check);
  },
  setInstallUpdatesAutomatically: (install: boolean) => {
    ipcRenderer.send('set-install-updates-automatically', install);
  },
  checkForUpdates: () => {
    ipcRenderer.send('check-for-updates');
  },
  launchInstallerDownloadPage: () => {
    ipcRenderer.send('launch-installer-download-page');
  },
  setTheme: (theme: string) => {
    ipcRenderer.send('set-theme', theme);
  },
  setFrontEndMode: (mode: string) => {
    ipcRenderer.send('set-frontend-mode', mode);
  }
});

export {};
