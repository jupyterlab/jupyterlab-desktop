import { describe, expect, it, vi } from 'vitest';
import { SessionWindow } from '../../src/main/sessionwindow/sessionwindow';

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
    const setProgress = vi.fn();
    const win = makeWindow({
      _restartingServer: false,
      _wsSettings: { setValue: vi.fn(), save: vi.fn() },
      _sessionConfig: {},
      _disposeSession: vi.fn().mockRejectedValue(new Error('stop failed')),
      _setProgress: setProgress
    });

    // Act: trigger the restart and let the rejected promise settle.
    win._restartServerInPythonEnvironment('/path/to/python');
    await new Promise(resolve => setTimeout(resolve, 0));

    // Assert: the recovery path surfaces a visible error and clears the guard.
    expect(setProgress).toHaveBeenCalledWith(
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
});
