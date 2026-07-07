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

    // Assert: the popup's left edge must never go negative.
    expect(setBounds).toHaveBeenCalledTimes(1);
    expect(setBounds.mock.calls[0][0].x).toBeGreaterThanOrEqual(0);
  });
});
