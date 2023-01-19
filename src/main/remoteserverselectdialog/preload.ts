import { IRecentRemoteURL } from '../config/appdata';
const { contextBridge, ipcRenderer } = require('electron');

type RecentRemoteURLsUpdatedListener = (
  recentServers: IRecentRemoteURL[]
) => void;
type RunningServerListSetListener = (runningServers: string[]) => void;

let onRecentRemoteURLsUpdatedListener: RecentRemoteURLsUpdatedListener;
let onRunningServerListSetListener: RunningServerListSetListener;

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => {
    return {
      platform: process.platform
    };
  },
  isDarkTheme: () => {
    return ipcRenderer.invoke('is-dark-theme');
  },
  setRemoteServerOptions: (url: string, persistSessionData: boolean) => {
    ipcRenderer.send('set-remote-server-options', url, persistSessionData);
  },
  deleteRecentRemoteURL: (url: string) => {
    ipcRenderer.send('delete-recent-remote-url', url);
  },
  onRecentRemoteURLsUpdated: (callback: RecentRemoteURLsUpdatedListener) => {
    onRecentRemoteURLsUpdatedListener = callback;
  },
  onRunningServerListSet: (callback: RunningServerListSetListener) => {
    onRunningServerListSetListener = callback;
  }
});

ipcRenderer.on(
  'update-recent-remote-urls',
  (event, recentServers: IRecentRemoteURL[]) => {
    if (onRecentRemoteURLsUpdatedListener) {
      onRecentRemoteURLsUpdatedListener(recentServers);
    }
  }
);

ipcRenderer.on('set-running-server-list', (event, runningServers: string[]) => {
  if (onRunningServerListSetListener) {
    onRunningServerListSetListener(runningServers);
  }
});

export {};
