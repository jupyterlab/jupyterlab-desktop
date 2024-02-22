import { EventTypeMain, EventTypeRenderer } from '../eventtypes';

const { contextBridge, ipcRenderer } = require('electron');

type SetTitleListener = (title: string) => void;
type SetActiveListener = (active: boolean) => void;
type ShowServerStatusListener = (show: boolean) => void;
type ShowServerNotificationBadgeListener = (show: boolean) => void;

let onSetTitleListener: SetTitleListener;
let onSetActiveListener: SetActiveListener;
let onShowServerStatusListener: ShowServerStatusListener;
let onShowServerNotificationBadgeListener: ShowServerNotificationBadgeListener;

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => {
    return {
      platform: process.platform
    };
  },
  showAppContextMenu: () => {
    ipcRenderer.send(EventTypeMain.ShowAppContextMenu);
  },
  closeWindow: () => {
    ipcRenderer.send(EventTypeMain.CloseWindow);
  },
  isDarkTheme: () => {
    return ipcRenderer.invoke(EventTypeMain.IsDarkTheme);
  },
  minimizeWindow: () => {
    ipcRenderer.send(EventTypeMain.MinimizeWindow);
  },
  maximizeWindow: () => {
    ipcRenderer.send(EventTypeMain.MaximizeWindow);
  },
  restoreWindow: () => {
    ipcRenderer.send(EventTypeMain.RestoreWindow);
  },
  getServerInfo: () => {
    return ipcRenderer.invoke(EventTypeMain.GetServerInfo);
  },
  showEnvSelectPopup: () => {
    ipcRenderer.send(EventTypeMain.ShowEnvSelectPopup);
  },
  sendMouseEvent: (type: string, params: any) => {
    ipcRenderer.send(EventTypeMain.TitleBarMouseEvent, type, params);
  },
  onSetTitle: (callback: SetTitleListener) => {
    onSetTitleListener = callback;
  },
  onSetActive: (callback: SetActiveListener) => {
    onSetActiveListener = callback;
  },
  onShowServerStatus: (callback: ShowServerStatusListener) => {
    onShowServerStatusListener = callback;
  },
  onShowServerNotificationBadge: (
    callback: ShowServerNotificationBadgeListener
  ) => {
    onShowServerNotificationBadgeListener = callback;
  }
});

ipcRenderer.on(EventTypeRenderer.SetTitle, (event, title) => {
  if (onSetTitleListener) {
    onSetTitleListener(title);
  }
});

ipcRenderer.on(EventTypeRenderer.SetActive, (event, active) => {
  if (onSetActiveListener) {
    onSetActiveListener(active);
  }
});

ipcRenderer.on(EventTypeRenderer.ShowServerStatus, (event, show) => {
  if (onShowServerStatusListener) {
    onShowServerStatusListener(show);
  }
});

ipcRenderer.on(EventTypeRenderer.ShowServerNotificationBadge, (event, show) => {
  if (onShowServerNotificationBadgeListener) {
    onShowServerNotificationBadgeListener(show);
  }
});

export {};
