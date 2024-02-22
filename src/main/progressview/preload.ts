import { EventTypeMain, EventTypeRenderer } from '../eventtypes';

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
    return ipcRenderer.invoke(EventTypeMain.IsDarkTheme);
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
  },
  copyToClipboard: (content: string) => {
    ipcRenderer.send(EventTypeMain.CopyToClipboard, content);
  }
});

ipcRenderer.on(
  EventTypeRenderer.ShowProgress,
  (event, title, detail, showAnimation) => {
    if (onShowProgressListener) {
      onShowProgressListener(title, detail, showAnimation);
    }
  }
);

ipcRenderer.on(
  EventTypeRenderer.InstallPythonEnvStatus,
  (event, result, message) => {
    if (onInstallBundledPythonEnvStatusListener) {
      onInstallBundledPythonEnvStatusListener(result, message);
    }
  }
);

export {};
