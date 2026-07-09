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

describe('SessionWindow._restartServerInPythonEnvironment', () => {
  it('shows a recovery message when disposing the wedged session rejects', async () => {
    // Arrange: dispose rejects (e.g. a wedged server that will not stop).
    const showProgressView = vi.fn();
    const win = makeWindow({
      _restartingServer: false,
      _wsSettings: { setValue: vi.fn(), save: vi.fn() },
      _sessionConfig: {},
      _disposeSession: vi.fn().mockRejectedValue(new Error('stop failed')),
      _showProgressView: showProgressView
    });

    // Act: trigger the restart and let the rejected promise settle.
    win._restartServerInPythonEnvironment('/path/to/python');
    await new Promise(resolve => setTimeout(resolve, 0));

    // Assert: the recovery path surfaces a visible error via the progress view
    // (which attaches it if needed) and clears the guard.
    expect(showProgressView).toHaveBeenCalledWith(
      'Failed to restart server',
      expect.stringContaining('stop failed'),
      false
    );
    expect(win._restartingServer).toBe(false);
  });

  it('ignores a second restart dispatched while one is already running', () => {
    // Arrange: a restart is already in flight.
    const disposeSession = vi.fn();
    const win = makeWindow({
      _restartingServer: true,
      _wsSettings: { setValue: vi.fn(), save: vi.fn() },
      _sessionConfig: {},
      _disposeSession: disposeSession,
      _setProgress: vi.fn()
    });

    // Act: a concurrent restart request arrives.
    win._restartServerInPythonEnvironment('/path/to/python');

    // Assert: the re-entrancy guard drops it before touching the session.
    expect(disposeSession).not.toHaveBeenCalled();
  });

  it('hides the progress view once the restarted lab view paints', async () => {
    // Arrange: a successful restart whose lab view has not painted yet.
    let paint: (v: boolean) => void = () => undefined;
    const hideProgressView = vi.fn();
    const win = makeWindow({
      _restartingServer: false,
      _restartAttemptId: 0,
      _wsSettings: { setValue: vi.fn(), save: vi.fn() },
      _sessionConfig: {},
      _disposeSession: vi.fn().mockResolvedValue(undefined),
      _createServerForSession: vi.fn().mockResolvedValue(undefined),
      _updateContentView: vi.fn(),
      _hideProgressView: hideProgressView,
      _labView: {
        labUIReady: new Promise<boolean>(resolve => (paint = resolve))
      }
    });

    // Act: run the restart, then let the lab view paint with nothing newer shown.
    win._restartServerInPythonEnvironment('/path/to/python');
    await new Promise(resolve => setTimeout(resolve, 0));
    paint(true);
    await new Promise(resolve => setTimeout(resolve, 0));

    // Assert: the spinner is hidden.
    expect(hideProgressView).toHaveBeenCalledTimes(1);
  });

  it('does not hide the progress view when a later restart has superseded it', async () => {
    // Arrange: a restart whose lab view has not painted; before it does, a later
    // restart attempt starts (which, whether it keeps loading or fails and shows
    // a recovery message, must not have its screen wiped by this stale hide).
    let paint: (v: boolean) => void = () => undefined;
    const hideProgressView = vi.fn();
    const win = makeWindow({
      _restartingServer: false,
      _restartAttemptId: 0,
      _wsSettings: { setValue: vi.fn(), save: vi.fn() },
      _sessionConfig: {},
      _disposeSession: vi.fn().mockResolvedValue(undefined),
      _createServerForSession: vi.fn().mockResolvedValue(undefined),
      _updateContentView: vi.fn(),
      _hideProgressView: hideProgressView,
      _labView: {
        labUIReady: new Promise<boolean>(resolve => (paint = resolve))
      }
    });

    // Act: run the restart, let a later restart attempt bump the id, then let
    // the first (now superseded) lab view finally paint.
    win._restartServerInPythonEnvironment('/path/to/python');
    await new Promise(resolve => setTimeout(resolve, 0));
    win._restartAttemptId++;
    paint(true);
    await new Promise(resolve => setTimeout(resolve, 0));

    // Assert: the stale continuation does not wipe the newer screen.
    expect(hideProgressView).not.toHaveBeenCalled();
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

describe('SessionWindow._resizeEnvSelectPopup', () => {
  it('keeps the popup on screen when the window is narrower than the popup', () => {
    // Arrange: a 400px title bar (the window minWidth) is narrower than the
    // 600px popup, so an unclamped x would place the popup off the left edge.
    const setBounds = vi.fn();
    const win = makeWindow({
      _envSelectPopupVisible: true,
      _titleBarView: {
        view: { getBounds: () => ({ width: 400, height: 60 }) }
      },
      _envSelectPopup: {
        getScrollHeight: () => 300,
        view: { view: { setBounds } }
      }
    });

    // Act
    win._resizeEnvSelectPopup();

    // Assert: the whole popup fits inside the window, so neither the search box
    // on the left nor the env list on the right is clipped. Clamping x alone
    // would only move the clipping to the other edge, so the width is capped too.
    expect(setBounds).toHaveBeenCalledTimes(1);
    const bounds = setBounds.mock.calls[0][0];
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(400);
  });
});
