const { contextBridge, ipcRenderer } = require('electron');
import * as electronLog from 'electron-log';

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
      electronLog.log(params);
    },
    info: (...params: any[]): void => {
      electronLog.info(params);
    },
    warn: (...params: any[]): void => {
      electronLog.warn(params);
    },
    debug: (...params: any[]): void => {
      electronLog.debug(params);
    },
    error: (...params: any[]): void => {
      electronLog.error(params);
    }
  }
});

ipcRenderer.on('open-file-event', (event, path) => {
  if (onOpenFileEventListener) {
    onOpenFileEventListener(path);
  }
});

export {};
