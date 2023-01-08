const { contextBridge, ipcRenderer } = require('electron');

type ShowProgressListener = (message: string, showAnimation: boolean) => void;

let onShowProgressListener: ShowProgressListener;

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => {
    return {
      platform: process.platform
    };
  },
  isDarkTheme: () => {
    return ipcRenderer.invoke('is-dark-theme');
  },
  onShowProgress: (callback: ShowProgressListener) => {
    onShowProgressListener = callback;
  },
  sendMessageToMain: (message: string, ...args: any[]) => {
    ipcRenderer.send(message, ...args);
  }
});

ipcRenderer.on('show-progress', (event, message, showAnimation) => {
  if (onShowProgressListener) {
    onShowProgressListener(message, showAnimation);
  }
});

export {};
