import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionWindow } from '../../src/main/sessionwindow/sessionwindow';
import { LabView } from '../../src/main/labview/labview';

// Drive the real _disposeSession without the heavy constructor: create an
// instance linked to the prototype and set only the fields the method reads.
function makeWindow(fields: Record<string, unknown>): any {
  const win = Object.create(SessionWindow.prototype);
  win._wsSettings = { save: vi.fn() };
  Object.assign(win, fields);
  return win;
}

describe('SessionWindow._disposeSession', () => {
  it('does not throw when a remote non-persistent session is disposed after its labView was already cleared', async () => {
    // Arrange: remote, no persistence, labView already nulled (the state left
    // behind after _closeSession switched the window back to Welcome).
    const win = makeWindow({
      _sessionConfig: { isRemote: true, persistSessionData: false },
      _labView: null
    });

    // Act + Assert: a second best-effort dispose must resolve, not reject.
    await expect(win._disposeSession()).resolves.toBeUndefined();
  });
});

describe('SessionWindow.dispose', () => {
  it('closes the persistent aux-view webContents that _disposeSession leaves alive', async () => {
    // Arrange: the labView teardown is out of scope here, so stub
    // _disposeSession; keep the persistent views with live webContents that
    // #42884 would otherwise leak on window close.
    const makeView = () => ({
      view: { webContents: { isDestroyed: () => false, close: vi.fn() } }
    });
    const makeNestedView = () => ({
      view: {
        view: { webContents: { isDestroyed: () => false, close: vi.fn() } }
      }
    });

    const titleBarView = makeView();
    const progressView = makeNestedView();
    const envSelectPopup = makeNestedView();

    const win = makeWindow({
      _evm: { dispose: vi.fn() },
      _disposeSession: vi.fn().mockResolvedValue(undefined),
      _titleBarView: titleBarView,
      _progressView: progressView,
      _envSelectPopup: envSelectPopup,
      _welcomeView: null
    });

    // Act
    await win.dispose();

    // Assert: each still-alive aux view had its renderer closed.
    expect(titleBarView.view.webContents.close).toHaveBeenCalledTimes(1);
    expect(progressView.view.view.webContents.close).toHaveBeenCalledTimes(1);
    expect(envSelectPopup.view.view.webContents.close).toHaveBeenCalledTimes(1);
  });

  it('does not re-close an aux-view webContents that is already destroyed', async () => {
    // Arrange: a titlebar whose renderer is already gone; close must be skipped.
    const close = vi.fn();
    const nestedDestroyed = () => ({
      view: {
        view: { webContents: { isDestroyed: () => true, close: vi.fn() } }
      }
    });
    const titleBarView = {
      view: { webContents: { isDestroyed: () => true, close } }
    };

    const win = makeWindow({
      _evm: { dispose: vi.fn() },
      _disposeSession: vi.fn().mockResolvedValue(undefined),
      _titleBarView: titleBarView,
      _progressView: nestedDestroyed(),
      _envSelectPopup: nestedDestroyed(),
      _welcomeView: null
    });

    // Act
    await win.dispose();

    // Assert: the guard skips close() on an already-destroyed webContents.
    expect(close).not.toHaveBeenCalled();
  });
});

describe('LabView.labUIReady', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops polling on dispose without firing a stale continuation', async () => {
    vi.useFakeTimers();

    // Arrange: a LabView that never reached the ready state, so labUIReady is
    // still polling on a timer.
    const labView: any = Object.create(LabView.prototype);
    labView._labUIReady = false;
    labView._isDisposed = false;
    labView._evm = { dispose: vi.fn() };
    labView._sessionConfig = { isRemote: false };
    labView._view = { webContents: { isDestroyed: () => true } };

    let settled = false;
    labView.labUIReady.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(100);
    // Still polling before dispose.
    expect(vi.getTimerCount()).toBe(1);

    // Act: dispose mid-startup, then let the pending tick fire.
    await labView.dispose();
    await vi.advanceTimersByTimeAsync(1000);

    // Assert: the poll stopped (no leaked timer) and the promise never
    // resolved, so the consumers' .then continuations do not run against the
    // now null labView.
    expect(vi.getTimerCount()).toBe(0);
    expect(settled).toBe(false);
  });
});
