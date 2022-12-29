const { contextBridge, ipcRenderer } = require('electron');

type InstallBundledPythonEnvResultListener = (result: string) => void;
type CustomPythonPathSelectedListener = (path: string) => void;
type WorkingDirectorySelectedListener = (path: string) => void;

let onInstallBundledPythonEnvResultListener: InstallBundledPythonEnvResultListener;
let onCustomPythonPathSelectedListener: CustomPythonPathSelectedListener;
let onWorkingDirectorySelectedListener: WorkingDirectorySelectedListener;

contextBridge.exposeInMainWorld('electronAPI', {
  getAppConfig: () => {
    return {
      platform: process.platform
    };
  },
  isDarkTheme: () => {
    return ipcRenderer.invoke('is-dark-theme');
  },
  restartApp: () => {
    ipcRenderer.send('restart-app');
  },
  setCheckForUpdatesAutomatically: (check: boolean) => {
    ipcRenderer.send('set-check-for-updates-automatically', check);
  },
  setInstallUpdatesAutomatically: (install: boolean) => {
    ipcRenderer.send('set-install-updates-automatically', install);
  },
  checkForUpdates: () => {
    ipcRenderer.send('check-for-updates');
  },
  launchInstallerDownloadPage: () => {
    ipcRenderer.send('launch-installer-download-page');
  },
  setTheme: (theme: string) => {
    ipcRenderer.send('set-theme', theme);
  },
  setSyncJupyterLabTheme: (sync: boolean) => {
    ipcRenderer.send('set-sync-jupyterlab-theme', sync);
  },
  setFrontEndMode: (mode: string) => {
    ipcRenderer.send('set-frontend-mode', mode);
  },
  selectWorkingDirectory: () => {
    ipcRenderer.send('select-working-directory');
  },
  onWorkingDirectorySelected: (callback: WorkingDirectorySelectedListener) => {
    onWorkingDirectorySelectedListener = callback;
  },
  setDefaultWorkingDirectory: (path: string) => {
    ipcRenderer.send('set-default-working-directory', path);
  },
  installBundledPythonEnv: () => {
    ipcRenderer.send('install-bundled-python-env');
  },
  updateBundledPythonEnv: () => {
    ipcRenderer.send('install-bundled-python-env');
  },
  onInstallBundledPythonEnvResult: (
    callback: InstallBundledPythonEnvResultListener
  ) => {
    onInstallBundledPythonEnvResultListener = callback;
  },
  selectPythonPath: () => {
    ipcRenderer.send('select-python-path');
  },
  onCustomPythonPathSelected: (callback: CustomPythonPathSelectedListener) => {
    onCustomPythonPathSelectedListener = callback;
  },
  setDefaultPythonPath: (path: string) => {
    ipcRenderer.send('set-default-python-path', path);
  },
  validatePythonPath: (path: string) => {
    return ipcRenderer.invoke('validate-python-path', path);
  },
  showInvalidPythonPathMessage: (path: string) => {
    ipcRenderer.send('show-invalid-python-path-message', path);
  }
});

ipcRenderer.on('working-directory-selected', (event, path) => {
  if (onWorkingDirectorySelectedListener) {
    onWorkingDirectorySelectedListener(path);
  }
});

ipcRenderer.on('install-bundled-python-env-result', (event, result) => {
  if (onInstallBundledPythonEnvResultListener) {
    onInstallBundledPythonEnvResultListener(result);
  }
});

ipcRenderer.on('custom-python-path-selected', (event, path) => {
  if (onCustomPythonPathSelectedListener) {
    onCustomPythonPathSelectedListener(path);
  }
});

export {};
