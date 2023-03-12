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
  setAuthDialogResponse: (username: string, password: string) => {
    ipcRenderer.send(EventTypeMain.SetAuthDialogResponse, username, password);
  }
});

export {};
