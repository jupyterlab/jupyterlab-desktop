import { EventTypeMain } from '../eventtypes';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => {
    return {
      platform: process.platform
    };
  },
  isDarkTheme: () => {
    return ipcRenderer.invoke(EventTypeMain.IsDarkTheme);
  },
  setCheckForUpdatesAutomatically: (check: boolean) => {
    ipcRenderer.send(EventTypeMain.SetCheckForUpdatesAutomatically, check);
  },
  setInstallUpdatesAutomatically: (install: boolean) => {
    ipcRenderer.send(EventTypeMain.SetInstallUpdatesAutomatically, install);
  },
  launchInstallerDownloadPage: () => {
    ipcRenderer.send(EventTypeMain.LaunchInstallerDownloadPage);
  }
});

export {};
