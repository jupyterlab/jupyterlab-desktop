import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventTypeMain, EventTypeRenderer } from '../../../src/main/eventtypes';
import { exposedAPI, ipcRenderer, rendererHandler } from './helpers';

async function load(): Promise<Record<string, any>> {
  await import('../../../src/main/remoteserverselectdialog/preload');
  return exposedAPI();
}

describe('remoteserverselectdialog preload', () => {
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
        'setRemoteServerOptions',
        'deleteRecentRemoteURL',
        'onRecentRemoteURLsUpdated',
        'onRunningServerListSet'
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

  it('setRemoteServerOptions forwards url and persist flag on SetRemoteServerOptions', async () => {
    const api = await load();
    api.setRemoteServerOptions('https://example.org', true);
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.SetRemoteServerOptions,
      'https://example.org',
      true
    );
  });

  it('deleteRecentRemoteURL forwards the url on DeleteRecentRemoteURL', async () => {
    const api = await load();
    api.deleteRecentRemoteURL('https://example.org');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.DeleteRecentRemoteURL,
      'https://example.org'
    );
  });

  it('onRecentRemoteURLsUpdated relays UpdateRecentRemoteURLs to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onRecentRemoteURLsUpdated(cb);
    const servers = [{ url: 'https://example.org' }];
    rendererHandler(EventTypeRenderer.UpdateRecentRemoteURLs)({}, servers);
    expect(cb).toHaveBeenCalledWith(servers);
  });

  it('onRunningServerListSet relays SetRunningServerList to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onRunningServerListSet(cb);
    rendererHandler(EventTypeRenderer.SetRunningServerList)({}, ['a', 'b']);
    expect(cb).toHaveBeenCalledWith(['a', 'b']);
  });

  it('does not expose the raw ipcRenderer object', async () => {
    const api = await load();
    expect(Object.values(api)).not.toContain(ipcRenderer);
  });
});
