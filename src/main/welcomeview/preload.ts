import electron = require('electron');
import { EventTypeMain, EventTypeRenderer } from '../eventtypes';

const { contextBridge, ipcRenderer, webUtils } = electron;

type SetRecentSessionListListener = (
  recentSessions: any[],
  recentCollapseState: boolean
) => void;
type SetNewsListListener = (list: any[]) => void;
type NotificationMessage = string | { type: 'env-not-found' };
type SetNotificationMessageListener = (
  message: NotificationMessage,
  closable: boolean
) => void;
type EnableLocalServerActionsListener = (enable: boolean) => void;
type InstallBundledPythonEnvStatusListener = (
  status: string,
  message: string
) => void;

let onSetRecentSessionListListener: SetRecentSessionListListener;
let onSetNewsListListener: SetNewsListListener;
let onSetNotificationMessageListener: SetNotificationMessageListener;
let onEnableLocalServerActionsListener: EnableLocalServerActionsListener;
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
  newSession: (
    type: 'notebook' | 'blank' | 'open' | 'open-file' | 'open-folder' | 'remote'
  ) => {
    if (type === 'notebook' || type === 'blank') {
      ipcRenderer.send(EventTypeMain.CreateNewSession, type);
    } else if (type === 'open') {
      ipcRenderer.send(EventTypeMain.OpenFileOrFolder);
    } else if (type === 'open-file') {
      ipcRenderer.send(EventTypeMain.OpenFile);
    } else if (type === 'open-folder') {
      ipcRenderer.send(EventTypeMain.OpenFolder);
    } else if (type === 'remote') {
      ipcRenderer.send(EventTypeMain.CreateNewRemoteSession);
    }
  },
  openRecentSession(sessionIndex: number) {
    ipcRenderer.send(EventTypeMain.OpenRecentSession, sessionIndex);
  },
  deleteRecentSession(sessionIndex: number) {
    ipcRenderer.send(EventTypeMain.DeleteRecentSession, sessionIndex);
  },
  openDroppedFiles(files: string[]) {
    ipcRenderer.send(EventTypeMain.OpenDroppedFiles, files);
  },
  // File.path was removed in Electron 32; the drop handler resolves the path
  // through webUtils here instead. Must run in the preload (webUtils is not
  // exposed to the page world).
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openNewsLink: (newsLink: string) => {
    ipcRenderer.send(EventTypeMain.OpenNewsLink, newsLink);
  },
  sendMessageToMain: (message: string, ...args: any[]) => {
    ipcRenderer.send(message, ...args);
  },
  onSetRecentSessionList: (callback: SetRecentSessionListListener) => {
    onSetRecentSessionListListener = callback;
  },
  onSetNewsList: (callback: SetNewsListListener) => {
    onSetNewsListListener = callback;
  },
  onSetNotificationMessage: (callback: SetNotificationMessageListener) => {
    onSetNotificationMessageListener = callback;
  },
  onEnableLocalServerActions: (callback: EnableLocalServerActionsListener) => {
    onEnableLocalServerActionsListener = callback;
  },
  onInstallBundledPythonEnvStatus: (
    callback: InstallBundledPythonEnvStatusListener
  ) => {
    onInstallBundledPythonEnvStatusListener = callback;
  }
});

ipcRenderer.on(
  EventTypeRenderer.SetRecentSessionList,
  (event, recentSessions, recentCollapseState) => {
    if (onSetRecentSessionListListener) {
      onSetRecentSessionListListener(recentSessions, recentCollapseState);
    }
  }
);

ipcRenderer.on(EventTypeRenderer.SetNewsList, (event, list) => {
  if (onSetNewsListListener) {
    onSetNewsListListener(list);
  }
});

ipcRenderer.on(
  EventTypeRenderer.SetNotificationMessage,
  (event, message: NotificationMessage, closable: boolean) => {
    if (onSetNotificationMessageListener) {
      onSetNotificationMessageListener(message, closable);
    }
  }
);

ipcRenderer.on(EventTypeRenderer.EnableLocalServerActions, (event, enable) => {
  if (onEnableLocalServerActionsListener) {
    onEnableLocalServerActionsListener(enable);
  }
});

ipcRenderer.on(
  EventTypeRenderer.InstallPythonEnvStatus,
  (event, result, message) => {
    if (onInstallBundledPythonEnvStatusListener) {
      onInstallBundledPythonEnvStatusListener(result, message);
    }
  }
);

export {};
