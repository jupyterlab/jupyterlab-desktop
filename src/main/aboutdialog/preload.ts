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
  launchAboutJupyterPage: () => {
    ipcRenderer.send(EventTypeMain.LaunchAboutJupyterPage);
  }
});

export {};
