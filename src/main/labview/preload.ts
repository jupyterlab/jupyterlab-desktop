const { contextBridge, ipcRenderer } = require('electron');

type OpenFileEventListener = (path: string) => void;

let onOpenFileEventListener: OpenFileEventListener;

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
  getServerInfo: () => {
    return ipcRenderer.invoke('get-server-info');
  },
  broadcastLabUIReady: () => {
    ipcRenderer.send('lab-ui-ready');
  },
  onOpenFileEvent: (callback: OpenFileEventListener) => {
    onOpenFileEventListener = callback;
  },
  getCurrentRootPath: () => {
    return ipcRenderer.invoke('get-current-root-path');
  },
  logger: {
    log: (...params: any[]): void => {
      ipcRenderer.send('logger-log', params);
    },
    info: (...params: any[]): void => {
      ipcRenderer.send('logger-info', params);
    },
    warn: (...params: any[]): void => {
      ipcRenderer.send('logger-warn', params);
    },
    debug: (...params: any[]): void => {
      ipcRenderer.send('logger-debug', params);
    },
    error: (...params: any[]): void => {
      ipcRenderer.send('logger-error', params);
    }
  }
});

ipcRenderer.on('open-file-event', (event, path) => {
  if (onOpenFileEventListener) {
    onOpenFileEventListener(path);
  }
});

export {};
