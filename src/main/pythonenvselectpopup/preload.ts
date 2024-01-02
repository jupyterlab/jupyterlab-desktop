import { EventTypeMain, EventTypeRenderer } from '../eventtypes';
import { IPythonEnvironment } from '../tokens';

const { contextBridge, ipcRenderer } = require('electron');

type CurrentPythonPathSetListener = (path: string) => void;
type ResetPythonEnvSelectPopupListener = () => void;
type CustomPythonPathSelectedListener = (path: string) => void;
type SetPythonEnvironmentListListener = (envs: IPythonEnvironment[]) => void;

let onCustomPythonPathSelectedListener: CustomPythonPathSelectedListener;
let onCurrentPythonPathSetListener: CurrentPythonPathSetListener;
let onResetPythonEnvSelectPopupListener: ResetPythonEnvSelectPopupListener;
let onSetPythonEnvironmentListListener: SetPythonEnvironmentListListener;

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => {
    return {
      platform: process.platform
    };
  },
  isDarkTheme: () => {
    return ipcRenderer.invoke(EventTypeMain.IsDarkTheme);
  },
  showManagePythonEnvsDialog: () => {
    ipcRenderer.send(EventTypeMain.ShowManagePythonEnvironmentsDialog);
  },
  browsePythonPath: (currentPath: string) => {
    ipcRenderer.send(EventTypeMain.SelectPythonPath, currentPath);
  },
  setSessionPythonPath: (path: string) => {
    ipcRenderer.send(EventTypeMain.SetSessionPythonPath, path);
  },
  onCurrentPythonPathSet: (callback: CurrentPythonPathSetListener) => {
    onCurrentPythonPathSetListener = callback;
  },
  onResetPythonEnvSelectPopup: (
    callback: ResetPythonEnvSelectPopupListener
  ) => {
    onResetPythonEnvSelectPopupListener = callback;
  },
  onCustomPythonPathSelected: (callback: CustomPythonPathSelectedListener) => {
    onCustomPythonPathSelectedListener = callback;
  },
  hideEnvSelectPopup: () => {
    ipcRenderer.send(EventTypeMain.HideEnvSelectPopup);
  },
  onSetPythonEnvironmentList: (callback: SetPythonEnvironmentListListener) => {
    onSetPythonEnvironmentListListener = callback;
  },
  copySessionInfo: () => {
    ipcRenderer.send(EventTypeMain.CopySessionInfoToClipboard);
  }
});

ipcRenderer.on(EventTypeRenderer.SetCurrentPythonPath, (event, path) => {
  if (onCurrentPythonPathSetListener) {
    onCurrentPythonPathSetListener(path);
  }
});

ipcRenderer.on(EventTypeRenderer.ResetPythonEnvSelectPopup, event => {
  if (onResetPythonEnvSelectPopupListener) {
    onResetPythonEnvSelectPopupListener();
  }
});

ipcRenderer.on(EventTypeRenderer.CustomPythonPathSelected, (event, path) => {
  if (onCustomPythonPathSelectedListener) {
    onCustomPythonPathSelectedListener(path);
  }
});

ipcRenderer.on(EventTypeRenderer.SetPythonEnvironmentList, (event, envs) => {
  if (onSetPythonEnvironmentListListener) {
    onSetPythonEnvironmentListListener(envs);
  }
});

export {};
