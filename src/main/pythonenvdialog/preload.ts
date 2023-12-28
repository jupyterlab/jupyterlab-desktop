import { EventTypeMain, EventTypeRenderer } from '../eventtypes';
import { IPythonEnvironment } from '../tokens';

const { contextBridge, ipcRenderer } = require('electron');

type InstallBundledPythonEnvStatusListener = (
  status: string,
  msg: string
) => void;
type CustomPythonPathSelectedListener = (path: string) => void;
type WorkingDirectorySelectedListener = (path: string) => void;
type SetPythonEnvironmentListListener = (envs: IPythonEnvironment[]) => void;

let onInstallBundledPythonEnvStatusListener: InstallBundledPythonEnvStatusListener;
let onCustomPythonPathSelectedListener: CustomPythonPathSelectedListener;
let onWorkingDirectorySelectedListener: WorkingDirectorySelectedListener;
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
  restartApp: () => {
    ipcRenderer.send(EventTypeMain.RestartApp);
  },
  getNextPythonEnvironmentName: () => {
    return ipcRenderer.invoke(EventTypeMain.GetNextPythonEnvironmentName);
  },
  updateRegistry: () => {
    return ipcRenderer.invoke(EventTypeMain.UpdateRegistry);
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
  selectPythonEnvInstallDirectory: () => {
    return ipcRenderer.invoke(EventTypeMain.SelectPythonEnvInstallDirectory);
  },
  showPythonEnvironmentContextMenu: (pythonPath: string) => {
    ipcRenderer.send(
      EventTypeMain.ShowPythonEnvironmentContextMenu,
      pythonPath
    );
  },

  setCheckForUpdatesAutomatically: (check: boolean) => {
    ipcRenderer.send(EventTypeMain.SetCheckForUpdatesAutomatically, check);
  },
  setInstallUpdatesAutomatically: (install: boolean) => {
    ipcRenderer.send(EventTypeMain.SetInstallUpdatesAutomatically, install);
  },
  checkForUpdates: () => {
    ipcRenderer.send(EventTypeMain.CheckForUpdates);
  },
  showLogs: () => {
    ipcRenderer.send(EventTypeMain.ShowLogs);
  },
  launchInstallerDownloadPage: () => {
    ipcRenderer.send(EventTypeMain.LaunchInstallerDownloadPage);
  },
  setStartupMode: (mode: string) => {
    ipcRenderer.send(EventTypeMain.SetStartupMode, mode);
  },
  setTheme: (theme: string) => {
    ipcRenderer.send(EventTypeMain.SetTheme, theme);
  },
  setSyncJupyterLabTheme: (sync: boolean) => {
    ipcRenderer.send(EventTypeMain.SetSyncJupyterLabTheme, sync);
  },
  setShowNewsFeed: (show: string) => {
    ipcRenderer.send(EventTypeMain.SetShowNewsFeed, show);
  },
  selectWorkingDirectory: () => {
    ipcRenderer.send(EventTypeMain.SelectWorkingDirectory);
  },
  onWorkingDirectorySelected: (callback: WorkingDirectorySelectedListener) => {
    onWorkingDirectorySelectedListener = callback;
  },
  onSetPythonEnvironmentList: (callback: SetPythonEnvironmentListListener) => {
    onSetPythonEnvironmentListListener = callback;
  },
  setDefaultWorkingDirectory: (path: string) => {
    ipcRenderer.send(EventTypeMain.SetDefaultWorkingDirectory, path);
  },
  installBundledPythonEnv: (envPath: string) => {
    ipcRenderer.send(EventTypeMain.InstallBundledPythonEnv, envPath);
  },
  updateBundledPythonEnv: () => {
    ipcRenderer.send(EventTypeMain.InstallBundledPythonEnv);
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
  showInvalidPythonPathMessage: (path: string) => {
    ipcRenderer.send(EventTypeMain.ShowInvalidPythonPathMessage, path);
  },
  clearHistory: (options: any) => {
    return ipcRenderer.invoke(EventTypeMain.ClearHistory, options);
  },
  setLogLevel: (level: string) => {
    ipcRenderer.send(EventTypeMain.SetLogLevel, level);
  },
  setServerLaunchArgs: (
    serverArgs: string,
    overrideDefaultServerArgs: boolean
  ) => {
    ipcRenderer.send(
      EventTypeMain.SetServerLaunchArgs,
      serverArgs,
      overrideDefaultServerArgs
    );
  },
  setServerEnvVars: (serverEnvVars: any) => {
    ipcRenderer.send(EventTypeMain.SetServerEnvVars, serverEnvVars);
  },
  setCtrlWBehavior: (behavior: string) => {
    ipcRenderer.send(EventTypeMain.SetCtrlWBehavior, behavior);
  }
});

ipcRenderer.on(EventTypeRenderer.WorkingDirectorySelected, (event, path) => {
  if (onWorkingDirectorySelectedListener) {
    onWorkingDirectorySelectedListener(path);
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

export {};
