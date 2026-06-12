import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventTypeMain } from '../../../src/main/eventtypes';
import { exposedAPI, ipcRenderer } from './helpers';

async function load(): Promise<Record<string, any>> {
  await import('../../../src/main/updatedialog/preload');
  return exposedAPI();
}

describe('updatedialog preload', () => {
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
        'setCheckForUpdatesAutomatically',
        'setInstallUpdatesAutomatically',
        'launchInstallerDownloadPage'
      ].sort()
    );
  });

  it('getAppConfig returns the platform without touching IPC', async () => {
    const api = await load();
    expect(api.getAppConfig()).toEqual({ platform: process.platform });
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    expect(ipcRenderer.send).not.toHaveBeenCalled();
  });

  it('isDarkTheme forwards to invoke on the IsDarkTheme channel', async () => {
    const api = await load();
    api.isDarkTheme();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(EventTypeMain.IsDarkTheme);
  });

  it('setCheckForUpdatesAutomatically forwards its flag on SetCheckForUpdatesAutomatically', async () => {
    const api = await load();
    api.setCheckForUpdatesAutomatically(true);
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.SetCheckForUpdatesAutomatically,
      true
    );
  });

  it('setInstallUpdatesAutomatically forwards its flag on SetInstallUpdatesAutomatically', async () => {
    const api = await load();
    api.setInstallUpdatesAutomatically(false);
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.SetInstallUpdatesAutomatically,
      false
    );
  });

  it('launchInstallerDownloadPage forwards to send on LaunchInstallerDownloadPage', async () => {
    const api = await load();
    api.launchInstallerDownloadPage();
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.LaunchInstallerDownloadPage
    );
  });

  it('does not expose the raw ipcRenderer object', async () => {
    const api = await load();
    expect(Object.values(api)).not.toContain(ipcRenderer);
  });
});
