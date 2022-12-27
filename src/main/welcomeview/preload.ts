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
  newSession: (type: 'notebook' | 'blank' | 'open' | 'remote') => {
    if (type === 'notebook' || type === 'blank') {
      ipcRenderer.send('create-new-session', type);
    } else if (type === 'open') {
      ipcRenderer.send('open-file-or-folder');
    } else if (type === 'remote') {
      ipcRenderer.send('connect-to-remote-session');
    }
  }
});

export {};
