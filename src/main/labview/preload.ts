import electron = require('electron');
import { EventTypeMain } from '../eventtypes';

const { contextBridge, ipcRenderer } = electron;

contextBridge.exposeInMainWorld('electronAPI', {
  getServerInfo: () => {
    return ipcRenderer.invoke(EventTypeMain.GetServerInfo);
  },
  broadcastLabUIReady: () => {
    ipcRenderer.send(EventTypeMain.LabUIReady);
  }
});

export {};
