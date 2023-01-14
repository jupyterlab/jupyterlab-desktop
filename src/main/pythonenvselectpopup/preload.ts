const { contextBridge, ipcRenderer } = require('electron');

type CurrentPythonPathSetListener = (path: string) => void;
type CustomPythonPathSelectedListener = (path: string) => void;

let onCustomPythonPathSelectedListener: CustomPythonPathSelectedListener;
let onCurrentPythonPathSetListener: CurrentPythonPathSetListener;

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => {
    return {
      platform: process.platform
    };
  },
  isDarkTheme: () => {
    return ipcRenderer.invoke('is-dark-theme');
  },
  browsePythonPath: (currentPath: string) => {
    ipcRenderer.send('select-python-path', currentPath);
  },
  setPythonPath: (path: string) => {
    ipcRenderer.send('set-python-path', path);
  },
  onCurrentPythonPathSet: (callback: CurrentPythonPathSetListener) => {
    onCurrentPythonPathSetListener = callback;
  },
  onCustomPythonPathSelected: (callback: CustomPythonPathSelectedListener) => {
    onCustomPythonPathSelectedListener = callback;
  },
  hideEnvSelectPopup: () => {
    ipcRenderer.send('hide-env-select-popup');
  }
});

ipcRenderer.on('set-current-python-path', (event, path) => {
  if (onCurrentPythonPathSetListener) {
    onCurrentPythonPathSetListener(path);
  }
});

ipcRenderer.on('custom-python-path-selected', (event, path) => {
  if (onCustomPythonPathSelectedListener) {
    onCustomPythonPathSelectedListener(path);
  }
});

export {};
