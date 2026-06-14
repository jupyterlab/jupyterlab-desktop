import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventTypeMain, EventTypeRenderer } from '../../../src/main/eventtypes';
import { exposedAPI, ipcRenderer, rendererHandler } from './helpers';

async function load(): Promise<Record<string, any>> {
  await import('../../../src/main/pythonenvdialog/preload');
  return exposedAPI();
}

describe('pythonenvdialog preload', () => {
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
        'getNextPythonEnvironmentName',
        'getPythonEnvironmentList',
        'createNewPythonEnvironment',
        'selectDirectoryPath',
        'selectFilePath',
        'showPythonEnvironmentContextMenu',
        'browsePythonPath',
        'onSetPythonEnvironmentList',
        'onEnvironmentListUpdateStatus',
        'installBundledPythonEnv',
        'updateBundledPythonEnv',
        'onInstallBundledPythonEnvStatus',
        'selectPythonPath',
        'onCustomPythonPathSelected',
        'setDefaultPythonPath',
        'validatePythonPath',
        'getEnvironmentByPythonPath',
        'addEnvironmentByPythonPath',
        'validateNewPythonEnvironmentName',
        'validatePythonEnvironmentInstallDirectory',
        'setPythonEnvironmentInstallDirectory',
        'validateCondaPath',
        'setCondaPath',
        'validateCondaChannels',
        'setCondaChannels',
        'validateSystemPythonPath',
        'setSystemPythonPath'
      ].sort()
    );
  });

  it('getAppConfig returns the platform without touching IPC', async () => {
    const api = await load();
    expect(api.getAppConfig()).toEqual({ platform: process.platform });
  });

  it('invoke-based queries forward to their channels', async () => {
    const api = await load();
    api.getNextPythonEnvironmentName();
    api.getPythonEnvironmentList(true);
    api.validatePythonPath('/usr/bin/python3');
    api.getEnvironmentByPythonPath('/usr/bin/python3');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      EventTypeMain.GetNextPythonEnvironmentName
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      EventTypeMain.GetPythonEnvironmentList,
      true
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      EventTypeMain.ValidatePythonPath,
      '/usr/bin/python3'
    );
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      EventTypeMain.GetEnvironmentByPythonPath,
      '/usr/bin/python3'
    );
  });

  it('createNewPythonEnvironment forwards path, type and packages on CreateNewPythonEnvironment', async () => {
    const api = await load();
    api.createNewPythonEnvironment('/envs/a', 'conda', 'numpy');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.CreateNewPythonEnvironment,
      '/envs/a',
      'conda',
      'numpy'
    );
  });

  it('setCondaPath and setDefaultPythonPath forward their value on the right channel', async () => {
    const api = await load();
    api.setCondaPath('/opt/conda');
    api.setDefaultPythonPath('/usr/bin/python3');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.SetCondaPath,
      '/opt/conda'
    );
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      EventTypeMain.SetDefaultPythonPath,
      '/usr/bin/python3'
    );
  });

  it('onSetPythonEnvironmentList relays SetPythonEnvironmentList to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onSetPythonEnvironmentList(cb);
    const envs = [{ name: 'base' }];
    rendererHandler(EventTypeRenderer.SetPythonEnvironmentList)({}, envs);
    expect(cb).toHaveBeenCalledWith(envs);
  });

  it('onEnvironmentListUpdateStatus relays SetEnvironmentListUpdateStatus to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onEnvironmentListUpdateStatus(cb);
    rendererHandler(EventTypeRenderer.SetEnvironmentListUpdateStatus)(
      {},
      'fetching',
      'msg'
    );
    expect(cb).toHaveBeenCalledWith('fetching', 'msg');
  });

  it('onCustomPythonPathSelected relays CustomPythonPathSelected to the callback', async () => {
    const api = await load();
    const cb = vi.fn();
    api.onCustomPythonPathSelected(cb);
    rendererHandler(EventTypeRenderer.CustomPythonPathSelected)({}, '/p');
    expect(cb).toHaveBeenCalledWith('/p');
  });

  it('does not expose the raw ipcRenderer object', async () => {
    const api = await load();
    expect(Object.values(api)).not.toContain(ipcRenderer);
  });
});
