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
});

describe('LabView.labUIReady', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves false once the view is disposed mid-startup instead of polling forever', async () => {
    vi.useFakeTimers();

    // Arrange: a LabView that never reached the ready state, so labUIReady is
    // still polling on a timer.
    const labView: any = Object.create(LabView.prototype);
    labView._labUIReady = false;
    labView._isDisposed = false;
    labView._evm = { dispose: vi.fn() };
    labView._sessionConfig = { isRemote: false };
    labView._view = { webContents: { isDestroyed: () => true } };

    const ready = labView.labUIReady as Promise<boolean>;

    // Act: dispose mid-startup, then let the next poll tick fire.
    await labView.dispose();
    await vi.advanceTimersByTimeAsync(100);

    // Assert: the pending promise settles to false rather than leaking.
    await expect(ready).resolves.toBe(false);
  });
});
