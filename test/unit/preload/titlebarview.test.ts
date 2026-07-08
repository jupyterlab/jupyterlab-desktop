import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventTypeMain, EventTypeRenderer } from '../../../src/main/eventtypes';
import { exposedAPI, ipcRenderer, rendererHandler } from './helpers';

async function load(): Promise<Record<string, any>> {
  await import('../../../src/main/titlebarview/preload');
  return exposedAPI();
}

describe('titlebarview preload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exposes exactly the documented electronAPI keys', async () => {
    const api = await load();
    expect(Object.keys(api).sort()).toEqual(
      [
        'getAppConfig',
        'showAppContextMenu',
        'closeWindow',
        'isDarkTheme',
        'minimizeWindow',
        'maximizeWindow',
        'restoreWindow',
        'getServerInfo',
        'showEnvSelectPopup',
        'sendMouseEvent',
        'onSetTitle',
        'onSetActive',
        'onSetMaximized',
        'onShowServerStatus',
        'onShowServerNotificationBadge'
      ].sort()
    );
  });

  it('getAppConfig returns the platform without touching IPC', async () => {
    const api = await load();
    expect(api.getAppConfig()).toEqual({ platform: process.platform });
  });

  it('isDarkTheme and getServerInfo forward to invoke on their channels', async () => {
    const api = await load();
    api.isDarkTheme();
    api.getServerInfo();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(EventTypeMain.IsDarkTheme);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      EventTypeMain.GetServerInfo
    );
  });

  it('window controls forward to send on their channels', async () => {
    const api = await load();
    api.closeWindow();
    api.minimizeWindow();
    api.maximizeWindow();
    api.restoreWindow();
    expect(ipcRenderer.send).toHaveBeenCalledWith(EventTypeMain.CloseWindow);
    expect(ipcRenderer.send).toHaveBeenCalledWith(EventTypeMain.MinimizeWindow);
    expect(ipcRenderer.send).toHaveBeenCalledWith(EventTypeMain.MaximizeWindow);
    expect(ipcRenderer.send).toHaveBeenCalledWith(EventTypeMain.RestoreWindow);
  });

  it('sendMouseEvent forwards type and params on TitleBarMouseEvent', async () => {
    const api = await load();
    const params = { x: 1, y: 2 };
    api.sendMouseEvent('mousedown', params);
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.TitleBarMouseEvent,
      'mousedown',
      params
    );
  });

  it('onSetTitle relays SetTitle to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onSetTitle(cb);
    rendererHandler(EventTypeRenderer.SetTitle)({}, 'My Title');
    expect(cb).toHaveBeenCalledWith('My Title');
  });

  it('onSetActive relays SetActive to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onSetActive(cb);
    rendererHandler(EventTypeRenderer.SetActive)({}, true);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it('onSetMaximized relays SetMaximized to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onSetMaximized(cb);
    rendererHandler(EventTypeRenderer.SetMaximized)({}, true);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it('onShowServerStatus relays ShowServerStatus to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onShowServerStatus(cb);
    rendererHandler(EventTypeRenderer.ShowServerStatus)({}, false);
    expect(cb).toHaveBeenCalledWith(false);
  });

  it('onShowServerNotificationBadge relays ShowServerNotificationBadge to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onShowServerNotificationBadge(cb);
    rendererHandler(EventTypeRenderer.ShowServerNotificationBadge)({}, true);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it('does not expose the raw ipcRenderer object', async () => {
    const api = await load();
    expect(Object.values(api)).not.toContain(ipcRenderer);
  });
});
