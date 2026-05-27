import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventTypeMain, EventTypeRenderer } from '../../../src/main/eventtypes';
import { exposedAPI, ipcRenderer, rendererHandler } from './helpers';

async function load(): Promise<Record<string, any>> {
  await import('../../../src/main/settingsdialog/preload');
  return exposedAPI();
}

describe('settingsdialog preload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exposes exactly the documented electronAPI keys', async () => {
    const api = await load();
    expect(Object.keys(api).sort()).toEqual(
      [
        'getAppConfig',
        'isDarkTheme',
        'restartApp',
        'setCheckForUpdatesAutomatically',
        'setInstallUpdatesAutomatically',
        'checkForUpdates',
        'showLogs',
        'launchInstallerDownloadPage',
        'setStartupMode',
        'setTheme',
        'setSyncJupyterLabTheme',
        'setShowNewsFeed',
        'selectWorkingDirectory',
        'onWorkingDirectorySelected',
        'setDefaultWorkingDirectory',
        'clearHistory',
        'setLogLevel',
        'setServerLaunchArgs',
        'setServerEnvVars',
        'setCtrlWBehavior',
        'setSettings',
        'setupCLICommand'
      ].sort()
    );
  });

  it('getAppConfig returns the platform without touching IPC', async () => {
    const api = await load();
    expect(api.getAppConfig()).toEqual({ platform: process.platform });
  });

  it('isDarkTheme forwards to invoke on the IsDarkTheme channel', async () => {
    const api = await load();
    api.isDarkTheme();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(EventTypeMain.IsDarkTheme);
  });

  it('restartApp forwards to send on the RestartApp channel', async () => {
    const api = await load();
    api.restartApp();
    expect(ipcRenderer.send).toHaveBeenCalledWith(EventTypeMain.RestartApp);
  });

  it('setTheme forwards the theme on SetTheme', async () => {
    const api = await load();
    api.setTheme('dark');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.SetTheme,
      'dark'
    );
  });

  it('setServerLaunchArgs forwards args and the override flag on SetServerLaunchArgs', async () => {
    const api = await load();
    api.setServerLaunchArgs('--port 9999', true);
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.SetServerLaunchArgs,
      '--port 9999',
      true
    );
  });

  it('clearHistory forwards options via invoke on ClearHistory', async () => {
    const api = await load();
    const options = { sessions: true };
    api.clearHistory(options);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      EventTypeMain.ClearHistory,
      options
    );
  });

  it('setupCLICommand uses invoke on SetupCLICommandWithElevatedRights', async () => {
    const api = await load();
    api.setupCLICommand();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      EventTypeMain.SetupCLICommandWithElevatedRights
    );
  });

  it('onWorkingDirectorySelected relays WorkingDirectorySelected to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onWorkingDirectorySelected(cb);
    rendererHandler(EventTypeRenderer.WorkingDirectorySelected)(
      {},
      '/tmp/work'
    );
    expect(cb).toHaveBeenCalledWith('/tmp/work');
  });

  it('does not expose the raw ipcRenderer object', async () => {
    const api = await load();
    expect(Object.values(api)).not.toContain(ipcRenderer);
  });
});
