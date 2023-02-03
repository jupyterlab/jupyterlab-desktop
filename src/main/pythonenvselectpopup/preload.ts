import { EventTypeMain, EventTypeRenderer } from '../eventtypes';

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
    return ipcRenderer.invoke(EventTypeMain.IsDarkTheme);
  },
  browsePythonPath: (currentPath: string) => {
    ipcRenderer.send(EventTypeMain.SelectPythonPath, currentPath);
  },
  setPythonPath: (path: string) => {
    ipcRenderer.send(EventTypeMain.SetPythonPath, path);
  },
  onCurrentPythonPathSet: (callback: CurrentPythonPathSetListener) => {
    onCurrentPythonPathSetListener = callback;
  },
  onCustomPythonPathSelected: (callback: CustomPythonPathSelectedListener) => {
    onCustomPythonPathSelectedListener = callback;
  },
  hideEnvSelectPopup: () => {
    ipcRenderer.send(EventTypeMain.HideEnvSelectPopup);
  }
});

ipcRenderer.on(EventTypeRenderer.SetCurrentPythonPath, (event, path) => {
  if (onCurrentPythonPathSetListener) {
    onCurrentPythonPathSetListener(path);
  }
});

ipcRenderer.on(EventTypeRenderer.CustomPythonPathSelected, (event, path) => {
  if (onCustomPythonPathSelectedListener) {
    onCustomPythonPathSelectedListener(path);
  }
});

export {};
