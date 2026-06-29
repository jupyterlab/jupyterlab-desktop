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
