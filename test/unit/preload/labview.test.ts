import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventTypeMain } from '../../../src/main/eventtypes';
import { exposedAPI, ipcRenderer } from './helpers';

async function load(): Promise<Record<string, any>> {
  await import('../../../src/main/labview/preload');
  return exposedAPI();
}

describe('labview preload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exposes exactly the documented electronAPI keys', async () => {
    const api = await load();
    expect(Object.keys(api).sort()).toEqual(
      ['getServerInfo', 'broadcastLabUIReady'].sort()
    );
  });

  it('getServerInfo forwards to invoke on the GetServerInfo channel', async () => {
    const api = await load();
    api.getServerInfo();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      EventTypeMain.GetServerInfo
    );
  });

  it('broadcastLabUIReady forwards to send on the LabUIReady channel', async () => {
    const api = await load();
    api.broadcastLabUIReady();
    expect(ipcRenderer.send).toHaveBeenCalledWith(EventTypeMain.LabUIReady);
  });

  it('does not expose the raw ipcRenderer object', async () => {
    const api = await load();
    expect(Object.values(api)).not.toContain(ipcRenderer);
  });
});
