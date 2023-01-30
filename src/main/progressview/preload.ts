const { contextBridge, ipcRenderer } = require('electron');

type ShowProgressListener = (
  title: string,
  detail: string,
  showAnimation: boolean
) => void;
type InstallBundledPythonEnvStatusListener = (
  status: string,
  message: string
) => void;

let onShowProgressListener: ShowProgressListener;
let onInstallBundledPythonEnvStatusListener: InstallBundledPythonEnvStatusListener;

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
  },
  onInstallBundledPythonEnvStatus: (
    callback: InstallBundledPythonEnvStatusListener
  ) => {
    onInstallBundledPythonEnvStatusListener = callback;
  }
});

ipcRenderer.on('show-progress', (event, title, detail, showAnimation) => {
  if (onShowProgressListener) {
    onShowProgressListener(title, detail, showAnimation);
  }
});

ipcRenderer.on(
  'install-bundled-python-env-status',
  (event, result, message) => {
    if (onInstallBundledPythonEnvStatusListener) {
      onInstallBundledPythonEnvStatusListener(result, message);
    }
  }
);

export {};
