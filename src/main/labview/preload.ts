import { EventTypeMain } from '../eventtypes';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getServerInfo: () => {
    return ipcRenderer.invoke(EventTypeMain.GetServerInfo);
  },
  broadcastLabUIReady: () => {
    ipcRenderer.send(EventTypeMain.LabUIReady);
  }
});

export {};
