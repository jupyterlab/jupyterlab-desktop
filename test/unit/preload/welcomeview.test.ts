import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventTypeMain, EventTypeRenderer } from '../../../src/main/eventtypes';
import { exposedAPI, ipcRenderer, rendererHandler } from './helpers';

async function load(): Promise<Record<string, any>> {
  await import('../../../src/main/welcomeview/preload');
  return exposedAPI();
}

describe('welcomeview preload', () => {
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
        'newSession',
        'openRecentSession',
        'deleteRecentSession',
        'openDroppedFiles',
        'getPathForFile',
        'openNewsLink',
        'sendMessageToMain',
        'onSetRecentSessionList',
        'onSetNewsList',
        'onSetNotificationMessage',
        'onEnableLocalServerActions',
        'onInstallBundledPythonEnvStatus'
      ].sort()
    );
  });

  it('isDarkTheme forwards to invoke on the IsDarkTheme channel', async () => {
    const api = await load();
    api.isDarkTheme();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(EventTypeMain.IsDarkTheme);
  });

  it('newSession maps each session type to the matching channel', async () => {
    const api = await load();
    api.newSession('notebook');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.CreateNewSession,
      'notebook'
    );
    api.newSession('blank');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.CreateNewSession,
      'blank'
    );
    api.newSession('open');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.OpenFileOrFolder
    );
    api.newSession('open-file');
    expect(ipcRenderer.send).toHaveBeenCalledWith(EventTypeMain.OpenFile);
    api.newSession('open-folder');
    expect(ipcRenderer.send).toHaveBeenCalledWith(EventTypeMain.OpenFolder);
    api.newSession('remote');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.CreateNewRemoteSession
    );
  });

  it('openRecentSession forwards the index on OpenRecentSession', async () => {
    const api = await load();
    api.openRecentSession(3);
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.OpenRecentSession,
      3
    );
  });

  it('openNewsLink forwards the link on OpenNewsLink', async () => {
    const api = await load();
    api.openNewsLink('https://blog.jupyter.org');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.OpenNewsLink,
      'https://blog.jupyter.org'
    );
  });

  it('sendMessageToMain relays an arbitrary channel and args verbatim', async () => {
    const api = await load();
    api.sendMessageToMain('custom', 'a', 'b');
    expect(ipcRenderer.send).toHaveBeenCalledWith('custom', 'a', 'b');
  });

  it('onSetRecentSessionList relays SetRecentSessionList to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onSetRecentSessionList(cb);
    rendererHandler(EventTypeRenderer.SetRecentSessionList)({}, ['s1'], true);
    expect(cb).toHaveBeenCalledWith(['s1'], true);
  });

  it('onSetNotificationMessage relays SetNotificationMessage to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onSetNotificationMessage(cb);
    rendererHandler(EventTypeRenderer.SetNotificationMessage)({}, 'hi', false);
    expect(cb).toHaveBeenCalledWith('hi', false);
  });

  it('onInstallBundledPythonEnvStatus relays InstallPythonEnvStatus to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onInstallBundledPythonEnvStatus(cb);
    rendererHandler(EventTypeRenderer.InstallPythonEnvStatus)({}, 'ok', 'done');
    expect(cb).toHaveBeenCalledWith('ok', 'done');
  });

  it('does not expose the raw ipcRenderer object', async () => {
    const api = await load();
    expect(Object.values(api)).not.toContain(ipcRenderer);
  });
});
