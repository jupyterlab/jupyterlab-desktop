const { contextBridge, ipcRenderer } = require('electron');

type CustomPythonPathSelectedListener = (path: string) => void;

let onCustomPythonPathSelectedListener: CustomPythonPathSelectedListener;

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => {
    return {
      platform: process.platform
    };
  },
  isDarkTheme: () => {
    return ipcRenderer.invoke('is-dark-theme');
  },
  browsePythonPath: () => {
    ipcRenderer.send('select-python-path');
  },
  setPythonPath: (path: string) => {
    ipcRenderer.send('set-python-path', path);
  },
  onCustomPythonPathSelected: (callback: CustomPythonPathSelectedListener) => {
    onCustomPythonPathSelectedListener = callback;
  },
  closeEnvSelectPopup: () => {
    ipcRenderer.send('close-env-select-popup');
  },
  envSelectPopupHeightUpdated: (height: number) => {
    ipcRenderer.send('env-select-popup-height-updated', height);
  }
});

ipcRenderer.on('custom-python-path-selected', (event, path) => {
  if (onCustomPythonPathSelectedListener) {
    onCustomPythonPathSelectedListener(path);
  }
});

export {};
