const { contextBridge, ipcRenderer } = require('electron');

type SetRecentSessionListListener = (
  recentSessions: any[],
  recentCollapseState: boolean
) => void;
type SetNewsListListener = (list: any[]) => void;
type SetNotificationMessageListener = (
  message: string,
  closable: boolean
) => void;
type DisableLocalServerActionsListener = () => void;
type InstallBundledPythonEnvStatusListener = (
  status: string,
  message: string
) => void;

let onSetRecentSessionListListener: SetRecentSessionListListener;
let onSetNewsListListener: SetNewsListListener;
let onSetNotificationMessageListener: SetNotificationMessageListener;
let onDisableLocalServerActionsListener: DisableLocalServerActionsListener;
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
  newSession: (
    type: 'notebook' | 'blank' | 'open' | 'open-file' | 'open-folder' | 'remote'
  ) => {
    if (type === 'notebook' || type === 'blank') {
      ipcRenderer.send('create-new-session', type);
    } else if (type === 'open') {
      ipcRenderer.send('open-file-or-folder');
    } else if (type === 'open-file') {
      ipcRenderer.send('open-file');
    } else if (type === 'open-folder') {
      ipcRenderer.send('open-folder');
    } else if (type === 'remote') {
      ipcRenderer.send('create-new-remote-session');
    }
  },
  openRecentSession(sessionIndex: number) {
    ipcRenderer.send('open-recent-session', sessionIndex);
  },
  deleteRecentSession(sessionIndex: number) {
    ipcRenderer.send('delete-recent-session', sessionIndex);
  },
  openDroppedFiles(files: string[]) {
    ipcRenderer.send('open-dropped-files', files);
  },
  openNewsLink: (newsLink: string) => {
    ipcRenderer.send('open-news-link', newsLink);
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
  onDisableLocalServerActions: (
    callback: DisableLocalServerActionsListener
  ) => {
    onDisableLocalServerActionsListener = callback;
  },
  onInstallBundledPythonEnvStatus: (
    callback: InstallBundledPythonEnvStatusListener
  ) => {
    onInstallBundledPythonEnvStatusListener = callback;
  }
});

ipcRenderer.on(
  'set-recent-session-list',
  (event, recentSessions, recentCollapseState) => {
    if (onSetRecentSessionListListener) {
      onSetRecentSessionListListener(recentSessions, recentCollapseState);
    }
  }
);

ipcRenderer.on('set-news-list', (event, list) => {
  if (onSetNewsListListener) {
    onSetNewsListListener(list);
  }
});

ipcRenderer.on(
  'set-notification-message',
  (event, message: string, closable: boolean) => {
    if (onSetNotificationMessageListener) {
      onSetNotificationMessageListener(message, closable);
    }
  }
);

ipcRenderer.on('disable-local-server-actions', event => {
  if (onDisableLocalServerActionsListener) {
    onDisableLocalServerActionsListener();
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
