import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventTypeMain, EventTypeRenderer } from '../../../src/main/eventtypes';
import { exposedAPI, ipcRenderer, rendererHandler } from './helpers';

async function load(): Promise<Record<string, any>> {
  await import('../../../src/main/progressview/preload');
  return exposedAPI();
}

describe('progressview preload', () => {
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
        'onShowProgress',
        'sendMessageToMain',
        'onInstallBundledPythonEnvStatus',
        'copyToClipboard'
      ].sort()
    );
  });

  it('getAppConfig returns the platform without touching IPC', async () => {
    const api = await load();
    expect(api.getAppConfig()).toEqual({ platform: process.platform });
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });

  it('isDarkTheme forwards to invoke on the IsDarkTheme channel', async () => {
    const api = await load();
    api.isDarkTheme();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(EventTypeMain.IsDarkTheme);
  });

  it('copyToClipboard forwards the content on CopyToClipboard', async () => {
    const api = await load();
    api.copyToClipboard('text');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.CopyToClipboard,
      'text'
    );
  });

  it('sendMessageToMain relays an arbitrary channel and args verbatim', async () => {
    const api = await load();
    api.sendMessageToMain('custom-channel', 1, 'two');
    expect(ipcRenderer.send).toHaveBeenCalledWith('custom-channel', 1, 'two');
  });

  it('onShowProgress relays the ShowProgress message to the registered callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onShowProgress(cb);
    rendererHandler(EventTypeRenderer.ShowProgress)(
      {},
      'title',
      'detail',
      true
    );
    expect(cb).toHaveBeenCalledWith('title', 'detail', true);
  });

  it('onInstallBundledPythonEnvStatus relays the InstallPythonEnvStatus message', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onInstallBundledPythonEnvStatus(cb);
    rendererHandler(EventTypeRenderer.InstallPythonEnvStatus)({}, 'ok', 'msg');
    expect(cb).toHaveBeenCalledWith('ok', 'msg');
  });

  it('does not expose the raw ipcRenderer object', async () => {
    const api = await load();
    expect(Object.values(api)).not.toContain(ipcRenderer);
  });
});
