import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventTypeMain, EventTypeRenderer } from '../../../src/main/eventtypes';
import { exposedAPI, ipcRenderer, rendererHandler } from './helpers';

async function load(): Promise<Record<string, any>> {
  await import('../../../src/main/pythonenvselectpopup/preload');
  return exposedAPI();
}

describe('pythonenvselectpopup preload', () => {
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
        'showManagePythonEnvsDialog',
        'browsePythonPath',
        'setSessionPythonPath',
        'onCurrentPythonPathSet',
        'onResetPythonEnvSelectPopup',
        'onCustomPythonPathSelected',
        'hideEnvSelectPopup',
        'onSetPythonEnvironmentList',
        'restartSession',
        'copySessionInfo',
        'updateBundledPythonEnv',
        'onShowUpdateBundledEnvAction'
      ].sort()
    );
  });

  it('isDarkTheme forwards to invoke on the IsDarkTheme channel', async () => {
    const api = await load();
    api.isDarkTheme();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(EventTypeMain.IsDarkTheme);
  });

  it('browsePythonPath forwards the current path on SelectPythonPath', async () => {
    const api = await load();
    api.browsePythonPath('/usr/bin/python3');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.SelectPythonPath,
      '/usr/bin/python3'
    );
  });

  it('setSessionPythonPath forwards the path on SetSessionPythonPath', async () => {
    const api = await load();
    api.setSessionPythonPath('/opt/py');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.SetSessionPythonPath,
      '/opt/py'
    );
  });

  it('no-arg actions forward to send on their channels', async () => {
    const api = await load();
    api.showManagePythonEnvsDialog();
    api.hideEnvSelectPopup();
    api.restartSession();
    api.copySessionInfo();
    api.updateBundledPythonEnv();
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.ShowManagePythonEnvironmentsDialog
    );
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.HideEnvSelectPopup
    );
    expect(ipcRenderer.send).toHaveBeenCalledWith(EventTypeMain.RestartSession);
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.CopySessionInfoToClipboard
    );
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.UpdateBundledPythonEnv
    );
  });

  it('onCurrentPythonPathSet relays SetCurrentPythonPath to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onCurrentPythonPathSet(cb);
    rendererHandler(EventTypeRenderer.SetCurrentPythonPath)({}, '/p', 'rel');
    expect(cb).toHaveBeenCalledWith('/p', 'rel');
  });

  it('onResetPythonEnvSelectPopup relays ResetPythonEnvSelectPopup to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onResetPythonEnvSelectPopup(cb);
    rendererHandler(EventTypeRenderer.ResetPythonEnvSelectPopup)({});
    expect(cb).toHaveBeenCalled();
  });

  it('onShowUpdateBundledEnvAction relays ShowUpdateBundledEnvAction to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onShowUpdateBundledEnvAction(cb);
    rendererHandler(EventTypeRenderer.ShowUpdateBundledEnvAction)({}, true);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it('does not expose the raw ipcRenderer object', async () => {
    const api = await load();
    expect(Object.values(api)).not.toContain(ipcRenderer);
  });
});
