import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { EventManager } from '../../src/main/eventmanager';
import { EventTypeMain } from '../../src/main/eventtypes';

const mockIpcMain = vi.mocked(ipcMain);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EventManager.registerEventHandler', () => {
  it('calls ipcMain.on with the event type and handler', () => {
    const mgr = new EventManager();
    const handler = vi.fn();
    mgr.registerEventHandler(EventTypeMain.OpenFile, handler);
    expect(mockIpcMain.on).toHaveBeenCalledWith(
      EventTypeMain.OpenFile,
      handler
    );
  });

  it('registers multiple handlers for same event type', () => {
    const mgr = new EventManager();
    const h1 = vi.fn();
    const h2 = vi.fn();
    mgr.registerEventHandler(EventTypeMain.OpenFile, h1);
    mgr.registerEventHandler(EventTypeMain.OpenFile, h2);
    expect(mockIpcMain.on).toHaveBeenCalledTimes(2);
    expect(mockIpcMain.on).toHaveBeenCalledWith(EventTypeMain.OpenFile, h1);
    expect(mockIpcMain.on).toHaveBeenCalledWith(EventTypeMain.OpenFile, h2);
  });

  it('registers handlers for different event types independently', () => {
    const mgr = new EventManager();
    const h1 = vi.fn();
    const h2 = vi.fn();
    mgr.registerEventHandler(EventTypeMain.OpenFile, h1);
    mgr.registerEventHandler(EventTypeMain.OpenFolder, h2);
    expect(mockIpcMain.on).toHaveBeenCalledWith(EventTypeMain.OpenFile, h1);
    expect(mockIpcMain.on).toHaveBeenCalledWith(EventTypeMain.OpenFolder, h2);
  });
});

describe('EventManager.registerSyncEventHandler', () => {
  it('calls ipcMain.handle with the event type and handler', () => {
    const mgr = new EventManager();
    const handler = vi.fn();
    mgr.registerSyncEventHandler(EventTypeMain.IsDarkTheme, handler);
    expect(mockIpcMain.handle).toHaveBeenCalledWith(
      EventTypeMain.IsDarkTheme,
      handler
    );
  });

  it('registers sync handlers for different event types independently', () => {
    const mgr = new EventManager();
    const h1 = vi.fn();
    const h2 = vi.fn();
    // ipcMain.handle allows one handler per channel, so distinct channels is
    // the real registration shape, not two handlers on the same channel.
    mgr.registerSyncEventHandler(EventTypeMain.IsDarkTheme, h1);
    mgr.registerSyncEventHandler(EventTypeMain.ValidatePythonPath, h2);
    expect(mockIpcMain.handle).toHaveBeenCalledWith(
      EventTypeMain.IsDarkTheme,
      h1
    );
    expect(mockIpcMain.handle).toHaveBeenCalledWith(
      EventTypeMain.ValidatePythonPath,
      h2
    );
  });
});

describe('EventManager.unregisterEventHandler', () => {
  it('calls ipcMain.removeListener and removes from internal map', () => {
    const mgr = new EventManager();
    const handler = vi.fn();
    mgr.registerEventHandler(EventTypeMain.OpenFile, handler);
    vi.clearAllMocks();
    mgr.unregisterEventHandler(EventTypeMain.OpenFile, handler);
    expect(mockIpcMain.removeListener).toHaveBeenCalledWith(
      EventTypeMain.OpenFile,
      handler
    );
  });

  it('no-ops when event type was never registered', () => {
    const mgr = new EventManager();
    const handler = vi.fn();
    expect(() =>
      mgr.unregisterEventHandler(EventTypeMain.OpenFile, handler)
    ).not.toThrow();
    expect(mockIpcMain.removeListener).not.toHaveBeenCalled();
  });

  it('no-ops when handler is not in the list', () => {
    const mgr = new EventManager();
    const h1 = vi.fn();
    const h2 = vi.fn();
    mgr.registerEventHandler(EventTypeMain.OpenFile, h1);
    vi.clearAllMocks();
    mgr.unregisterEventHandler(EventTypeMain.OpenFile, h2);
    expect(mockIpcMain.removeListener).not.toHaveBeenCalled();
  });

  it('only removes the specified handler, leaves others intact', () => {
    const mgr = new EventManager();
    const h1 = vi.fn();
    const h2 = vi.fn();
    mgr.registerEventHandler(EventTypeMain.OpenFile, h1);
    mgr.registerEventHandler(EventTypeMain.OpenFile, h2);
    vi.clearAllMocks();
    mgr.unregisterEventHandler(EventTypeMain.OpenFile, h1);
    expect(mockIpcMain.removeListener).toHaveBeenCalledTimes(1);
    expect(mockIpcMain.removeListener).toHaveBeenCalledWith(
      EventTypeMain.OpenFile,
      h1
    );
  });
});

describe('EventManager.unregisterSyncEventHandler', () => {
  it('calls ipcMain.removeHandler with the channel for a sync handler', () => {
    const mgr = new EventManager();
    const handler = vi.fn();
    mgr.registerSyncEventHandler(EventTypeMain.IsDarkTheme, handler);
    vi.clearAllMocks();
    mgr.unregisterSyncEventHandler(EventTypeMain.IsDarkTheme, handler);
    // handle() handlers are removed by channel via removeHandler, not by
    // (channel, handler) via removeListener.
    expect(mockIpcMain.removeHandler).toHaveBeenCalledWith(
      EventTypeMain.IsDarkTheme
    );
    expect(mockIpcMain.removeListener).not.toHaveBeenCalled();
  });

  it('no-ops when event type was never registered', () => {
    const mgr = new EventManager();
    expect(() =>
      mgr.unregisterSyncEventHandler(EventTypeMain.IsDarkTheme, vi.fn())
    ).not.toThrow();
    expect(mockIpcMain.removeHandler).not.toHaveBeenCalled();
  });

  it('no-ops when the sync handler is not in the list', () => {
    const mgr = new EventManager();
    const registered = vi.fn();
    const other = vi.fn();
    mgr.registerSyncEventHandler(EventTypeMain.IsDarkTheme, registered);
    vi.clearAllMocks();
    mgr.unregisterSyncEventHandler(EventTypeMain.IsDarkTheme, other);
    expect(mockIpcMain.removeHandler).not.toHaveBeenCalled();
  });
});

describe('EventManager.unregisterAllEventHandlers', () => {
  it('removes all async handlers and calls ipcMain.removeListener for each', () => {
    const mgr = new EventManager();
    const h1 = vi.fn();
    const h2 = vi.fn();
    mgr.registerEventHandler(EventTypeMain.OpenFile, h1);
    mgr.registerEventHandler(EventTypeMain.OpenFolder, h2);
    vi.clearAllMocks();
    mgr.unregisterAllEventHandlers();
    expect(mockIpcMain.removeListener).toHaveBeenCalledWith(
      EventTypeMain.OpenFile,
      h1
    );
    expect(mockIpcMain.removeListener).toHaveBeenCalledWith(
      EventTypeMain.OpenFolder,
      h2
    );
  });

  it('no-ops when no handlers registered', () => {
    const mgr = new EventManager();
    expect(() => mgr.unregisterAllEventHandlers()).not.toThrow();
    expect(mockIpcMain.removeListener).not.toHaveBeenCalled();
  });
});

describe('EventManager.unregisterAllSyncEventHandlers', () => {
  it('calls removeHandler once per registered sync channel', () => {
    const mgr = new EventManager();
    const h1 = vi.fn();
    const h2 = vi.fn();
    mgr.registerSyncEventHandler(EventTypeMain.IsDarkTheme, h1);
    mgr.registerSyncEventHandler(EventTypeMain.ValidatePythonPath, h2);
    vi.clearAllMocks();
    mgr.unregisterAllSyncEventHandlers();
    expect(mockIpcMain.removeHandler).toHaveBeenCalledTimes(2);
    expect(mockIpcMain.removeHandler).toHaveBeenCalledWith(
      EventTypeMain.IsDarkTheme
    );
    expect(mockIpcMain.removeHandler).toHaveBeenCalledWith(
      EventTypeMain.ValidatePythonPath
    );
  });
});

describe('EventManager.dispose', () => {
  it('removes all async and sync handlers and returns a resolved Promise', async () => {
    const mgr = new EventManager();
    const async1 = vi.fn();
    const sync1 = vi.fn();
    mgr.registerEventHandler(EventTypeMain.OpenFile, async1);
    mgr.registerSyncEventHandler(EventTypeMain.IsDarkTheme, sync1);
    vi.clearAllMocks();
    await expect(mgr.dispose()).resolves.toBeUndefined();
    expect(mockIpcMain.removeListener).toHaveBeenCalledWith(
      EventTypeMain.OpenFile,
      async1
    );
    expect(mockIpcMain.removeHandler).toHaveBeenCalledWith(
      EventTypeMain.IsDarkTheme
    );
  });

  it('is safe to call dispose twice', async () => {
    const mgr = new EventManager();
    mgr.registerEventHandler(EventTypeMain.OpenFile, vi.fn());
    await mgr.dispose();
    vi.clearAllMocks();
    await expect(mgr.dispose()).resolves.toBeUndefined();
    expect(mockIpcMain.removeListener).not.toHaveBeenCalled();
  });
});
