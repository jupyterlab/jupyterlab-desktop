const { contextBridge, ipcRenderer } = require('electron');

type CustomPythonPathSelectedListener = (path: string) => void;
type InstallBundledPythonEnvResultListener = (result: string) => void;

let onCustomPythonPathSelectedListener: CustomPythonPathSelectedListener;
let onInstallBundledPythonEnvResultListener: InstallBundledPythonEnvResultListener;

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
  selectPythonPath: () => {
    ipcRenderer.send('select-python-path');
  },
  validateRemoteServerURL: (url: string) => {
    return ipcRenderer.invoke('validate-remote-server-url', url);
  },
  setRemoteServerURL: (url: string, persistSessionData: boolean) => {
    ipcRenderer.send('set-remote-server-url', url, persistSessionData);
  },
  clearSessionData: () => {
    return ipcRenderer.invoke('clear-session-data');
  },
  installBundledPythonEnv: () => {
    ipcRenderer.send('install-bundled-python-env');
  },
  setPythonPath: (path: string) => {
    ipcRenderer.send('set-python-path', path);
  },
  validatePythonPath: (path: string) => {
    return ipcRenderer.invoke('select-python-path');
  },
  showInvalidPythonPathMessage: (path: string) => {
    ipcRenderer.send('show-invalid-python-path-message', path);
  },
  onCustomPythonPathSelected: (callback: CustomPythonPathSelectedListener) => {
    onCustomPythonPathSelectedListener = callback;
  },
  onInstallBundledPythonEnvResult: (
    callback: InstallBundledPythonEnvResultListener
  ) => {
    onInstallBundledPythonEnvResultListener = callback;
  }
});

ipcRenderer.on('custom-python-path-selected', (event, path) => {
  if (onCustomPythonPathSelectedListener) {
    onCustomPythonPathSelectedListener(path);
  }
});

ipcRenderer.on('install-bundled-python-env-result', (event, result) => {
  if (onInstallBundledPythonEnvResultListener) {
    onInstallBundledPythonEnvResultListener(result);
  }
});

export {};
