import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventTypeMain } from '../../../src/main/eventtypes';
import { exposedAPI, ipcRenderer } from './helpers';

async function load(): Promise<Record<string, any>> {
  await import('../../../src/main/authdialog/preload');
  return exposedAPI();
}

describe('authdialog preload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exposes exactly the documented electronAPI keys', async () => {
    const api = await load();
    expect(Object.keys(api).sort()).toEqual(
      ['getAppConfig', 'isDarkTheme', 'setAuthDialogResponse'].sort()
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

  it('setAuthDialogResponse forwards username and password on SetAuthDialogResponse', async () => {
    const api = await load();
    api.setAuthDialogResponse('user', 'pass');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.SetAuthDialogResponse,
      'user',
      'pass'
    );
  });

  it('does not expose the raw ipcRenderer object', async () => {
    const api = await load();
    expect(Object.values(api)).not.toContain(ipcRenderer);
  });
});
