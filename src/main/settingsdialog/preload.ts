import { EventTypeMain, EventTypeRenderer } from '../eventtypes';

const { contextBridge, ipcRenderer } = require('electron');

type WorkingDirectorySelectedListener = (path: string) => void;

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
  setDefaultWorkingDirectory: (path: string) => {
    ipcRenderer.send(EventTypeMain.SetDefaultWorkingDirectory, path);
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
  },
  setSettings: (settings: { [key: string]: any }) => {
    ipcRenderer.send(EventTypeMain.SetSettings, settings);
  },
  setupCLICommand: () => {
    return ipcRenderer.invoke(EventTypeMain.SetupCLICommandWithElevatedRights);
  }
});

ipcRenderer.on(EventTypeRenderer.WorkingDirectorySelected, (event, path) => {
  if (onWorkingDirectorySelectedListener) {
    onWorkingDirectorySelectedListener(path);
  }
});

export {};
