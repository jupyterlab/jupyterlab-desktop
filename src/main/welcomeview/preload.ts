const { contextBridge, ipcRenderer } = require('electron');

type SetNewsListListener = (list: any[]) => void;

let onSetNewsListListener: SetNewsListListener;

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
  openDroppedFiles(files: string[]) {
    ipcRenderer.send('open-dropped-files', files);
  },
  openNewsLink: (newsLink: string) => {
    ipcRenderer.send('open-news-link', newsLink);
  },
  onSetNewsList: (callback: SetNewsListListener) => {
    onSetNewsListListener = callback;
  }
});

ipcRenderer.on('set-news-list', (event, list) => {
  if (onSetNewsListListener) {
    onSetNewsListListener(list);
  }
});

export {};
