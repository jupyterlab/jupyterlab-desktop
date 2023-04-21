import { EventTypeMain, EventTypeRenderer } from '../eventtypes';

const { contextBridge, ipcRenderer } = require('electron');

type InstallBundledPythonEnvStatusListener = (status: string) => void;
type CustomPythonPathSelectedListener = (path: string) => void;
type WorkingDirectorySelectedListener = (path: string) => void;

let onInstallBundledPythonEnvStatusListener: InstallBundledPythonEnvStatusListener;
let onCustomPythonPathSelectedListener: CustomPythonPathSelectedListener;
let onWorkingDirectorySelectedListener: WorkingDirectorySelectedListener;

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
  setCheckForUpdatesAutomatically: (check: boolean) => {
    ipcRenderer.send(EventTypeMain.SetCheckForUpdatesAutomatically, check);
  },
  setInstallUpdatesAutomatically: (install: boolean) => {
    ipcRenderer.send(EventTypeMain.SetInstallUpdatesAutomatically, install);
  },
  checkForUpdates: () => {
    ipcRenderer.send(EventTypeMain.CheckForUpdates);
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
  setDefaultWorkingDirectory: (path: string) => {
    ipcRenderer.send(EventTypeMain.SetDefaultWorkingDirectory, path);
  },
  installBundledPythonEnv: () => {
    ipcRenderer.send(EventTypeMain.InstallBundledPythonEnv);
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
  EventTypeRenderer.InstallBundledPythonEnvStatus,
  (event, result) => {
    if (onInstallBundledPythonEnvStatusListener) {
      onInstallBundledPythonEnvStatusListener(result);
    }
  }
);

ipcRenderer.on(EventTypeRenderer.CustomPythonPathSelected, (event, path) => {
  if (onCustomPythonPathSelectedListener) {
    onCustomPythonPathSelectedListener(path);
  }
});

export {};
