const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getServerInfo: () => {
    return ipcRenderer.invoke('get-server-info');
  },
  broadcastLabUIReady: () => {
    ipcRenderer.send('lab-ui-ready');
  }
});

export {};
