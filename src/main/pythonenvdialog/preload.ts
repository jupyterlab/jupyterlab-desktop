import { EventTypeMain, EventTypeRenderer } from '../eventtypes';
import { IPythonEnvironment } from '../tokens';

const { contextBridge, ipcRenderer } = require('electron');

type InstallBundledPythonEnvStatusListener = (
  status: string,
  msg: string
) => void;
type CustomPythonPathSelectedListener = (path: string) => void;
type SetPythonEnvironmentListListener = (envs: IPythonEnvironment[]) => void;
type EnvironmentListUpdateStatusListener = (
  status: string,
  message: string
) => void;

let onInstallBundledPythonEnvStatusListener: InstallBundledPythonEnvStatusListener;
let onCustomPythonPathSelectedListener: CustomPythonPathSelectedListener;
let onSetPythonEnvironmentListListener: SetPythonEnvironmentListListener;
let onEnvironmentListUpdateStatusListener: EnvironmentListUpdateStatusListener;

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => {
    return {
      platform: process.platform
    };
  },
  isDarkTheme: () => {
    return ipcRenderer.invoke(EventTypeMain.IsDarkTheme);
  },
  getNextPythonEnvironmentName: () => {
    return ipcRenderer.invoke(EventTypeMain.GetNextPythonEnvironmentName);
  },
  getPythonEnvironmentList: (cacheOK: boolean) => {
    return ipcRenderer.invoke(EventTypeMain.GetPythonEnvironmentList, cacheOK);
  },
  createNewPythonEnvironment: (
    envPath: string,
    envType: string,
    packages: string
  ) => {
    ipcRenderer.send(
      EventTypeMain.CreateNewPythonEnvironment,
      envPath,
      envType,
      packages
    );
  },
  selectDirectoryPath: (currentPath?: string) => {
    return ipcRenderer.invoke(EventTypeMain.SelectDirectoryPath, currentPath);
  },
  selectFilePath: (currentPath?: string) => {
    return ipcRenderer.invoke(EventTypeMain.SelectFilePath, currentPath);
  },
  showPythonEnvironmentContextMenu: (pythonPath: string) => {
    ipcRenderer.send(
      EventTypeMain.ShowPythonEnvironmentContextMenu,
      pythonPath
    );
  },
  browsePythonPath: (currentPath: string) => {
    ipcRenderer.send(EventTypeMain.SelectPythonPath, currentPath);
  },
  onSetPythonEnvironmentList: (callback: SetPythonEnvironmentListListener) => {
    onSetPythonEnvironmentListListener = callback;
  },
  onEnvironmentListUpdateStatus: (
    callback: EnvironmentListUpdateStatusListener
  ) => {
    onEnvironmentListUpdateStatusListener = callback;
  },
  installBundledPythonEnv: (envPath: string) => {
    ipcRenderer.send(EventTypeMain.InstallBundledPythonEnv, envPath);
  },
  updateBundledPythonEnv: () => {
    ipcRenderer.send(EventTypeMain.UpdateBundledPythonEnv);
  },
  onInstallBundledPythonEnvStatus: (
    callback: InstallBundledPythonEnvStatusListener
  ) => {
    onInstallBundledPythonEnvStatusListener = callback;
  },
  selectPythonPath: () => {
    ipcRenderer.send(EventTypeMain.SelectPythonPath);
  },
  onCustomPythonPathSelected: (callback: CustomPythonPathSelectedListener) => {
    onCustomPythonPathSelectedListener = callback;
  },
  setDefaultPythonPath: (path: string) => {
    ipcRenderer.send(EventTypeMain.SetDefaultPythonPath, path);
  },
  validatePythonPath: (path: string) => {
    return ipcRenderer.invoke(EventTypeMain.ValidatePythonPath, path);
  },
  getEnvironmentByPythonPath: (pythonPath: string) => {
    return ipcRenderer.invoke(
      EventTypeMain.GetEnvironmentByPythonPath,
      pythonPath
    );
  },
  addEnvironmentByPythonPath: (pythonPath: string) => {
    return ipcRenderer.invoke(
      EventTypeMain.AddEnvironmentByPythonPath,
      pythonPath
    );
  },
  validateNewPythonEnvironmentName: (name: string) => {
    return ipcRenderer.invoke(
      EventTypeMain.ValidateNewPythonEnvironmentName,
      name
    );
  },
  validatePythonEnvironmentInstallDirectory: (dirPath: string) => {
    return ipcRenderer.invoke(
      EventTypeMain.ValidatePythonEnvironmentInstallDirectory,
      dirPath
    );
  },
  setPythonEnvironmentInstallDirectory: (dirPath: string) => {
    return ipcRenderer.send(
      EventTypeMain.SetPythonEnvironmentInstallDirectory,
      dirPath
    );
  },
  validateCondaPath: (condaPath: string) => {
    return ipcRenderer.invoke(EventTypeMain.ValidateCondaPath, condaPath);
  },
  setCondaPath: (condaPath: string) => {
    return ipcRenderer.send(EventTypeMain.SetCondaPath, condaPath);
  },
  validateCondaChannels: (condaChannels: string) => {
    return ipcRenderer.invoke(
      EventTypeMain.ValidateCondaChannels,
      condaChannels
    );
  },
  setCondaChannels: (condaChannels: string) => {
    return ipcRenderer.send(EventTypeMain.SetCondaChannels, condaChannels);
  },
  validateSystemPythonPath: (pythonPath: string) => {
    return ipcRenderer.invoke(
      EventTypeMain.ValidateSystemPythonPath,
      pythonPath
    );
  },
  setSystemPythonPath: (pythonPath: string) => {
    return ipcRenderer.send(EventTypeMain.SetSystemPythonPath, pythonPath);
  }
});

ipcRenderer.on(
  EventTypeRenderer.InstallPythonEnvStatus,
  (event, result, msg) => {
    if (onInstallBundledPythonEnvStatusListener) {
      onInstallBundledPythonEnvStatusListener(result, msg);
    }
  }
);

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

ipcRenderer.on(
  EventTypeRenderer.SetEnvironmentListUpdateStatus,
  (event, status, message) => {
    if (onEnvironmentListUpdateStatusListener) {
      onEnvironmentListUpdateStatusListener(status, message);
    }
  }
);

export {};
