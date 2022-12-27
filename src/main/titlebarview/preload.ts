const { contextBridge, ipcRenderer } = require('electron');

type SetTitleListener = (title: string) => void;
type SetActiveListener = (active: boolean) => void;
type ShowServerStatusListener = (show: boolean) => void;

let onSetTitleListener: SetTitleListener;
let onSetActiveListener: SetActiveListener;
let onShowServerStatusListener: ShowServerStatusListener;

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => {
    return {
      platform: process.platform
    };
  },
  showAppContextMenu: () => {
    ipcRenderer.send('show-app-context-menu');
  },
  closeWindow: () => {
    ipcRenderer.send('close-active-window');
  },
  isDarkTheme: () => {
    return ipcRenderer.invoke('is-dark-theme');
  },
  minimizeWindow: () => {
    ipcRenderer.send('minimize-window');
  },
  maximizeWindow: () => {
    ipcRenderer.send('maximize-window');
  },
  restoreWindow: () => {
    ipcRenderer.send('restore-window');
  },
  getServerInfo: () => {
    return ipcRenderer.invoke('get-server-info');
  },
  getCurrentPythonEnvironment: () => {
    return ipcRenderer.invoke('get-current-python-environment');
  },
  showServerConfigDialog: () => {
    ipcRenderer.send('show-server-config-dialog');
  },
  onSetTitle: (callback: SetTitleListener) => {
    onSetTitleListener = callback;
  },
  onSetActive: (callback: SetActiveListener) => {
    onSetActiveListener = callback;
  },
  onShowServerStatus: (callback: ShowServerStatusListener) => {
    onShowServerStatusListener = callback;
  }
});

ipcRenderer.on('set-title', (event, title) => {
  if (onSetTitleListener) {
    onSetTitleListener(title);
  }
});

ipcRenderer.on('set-active', (event, active) => {
  if (onSetActiveListener) {
    onSetActiveListener(active);
  }
});

ipcRenderer.on('show-server-status', (event, show) => {
  if (onShowServerStatusListener) {
    onShowServerStatusListener(show);
  }
});

export {};
