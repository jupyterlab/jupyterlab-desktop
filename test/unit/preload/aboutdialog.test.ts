import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventTypeMain } from '../../../src/main/eventtypes';
import { exposedAPI, ipcRenderer } from './helpers';

async function load(): Promise<Record<string, any>> {
  await import('../../../src/main/aboutdialog/preload');
  return exposedAPI();
}

describe('aboutdialog preload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exposes exactly the documented electronAPI keys', async () => {
    const api = await load();
    expect(Object.keys(api).sort()).toEqual(
      ['getAppConfig', 'isDarkTheme', 'launchAboutJupyterPage'].sort()
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

  it('launchAboutJupyterPage forwards to send on the LaunchAboutJupyterPage channel', async () => {
    const api = await load();
    api.launchAboutJupyterPage();
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.LaunchAboutJupyterPage
    );
  });

  it('does not expose the raw ipcRenderer object', async () => {
    const api = await load();
    expect(Object.values(api)).not.toContain(ipcRenderer);
  });
});
