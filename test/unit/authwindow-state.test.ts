import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthWindow } from '../../src/main/authwindow/authwindow';

// The constructor builds a real BrowserWindow, so the state machine is
// exercised on a prototype-only instance with a stubbed window, the same shape
// app-checkforupdates.test.ts uses.
function makeWindow() {
  return {
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    destroy() {
      this.destroyed = true;
    }
  };
}

function makeAuthWindow(timeoutMs = 1000) {
  const auth = Object.create(AuthWindow.prototype) as AuthWindow;
  const onComplete = vi.fn();
  const onCancel = vi.fn();
  const window = makeWindow();
  const popup = makeWindow();
  const internals = (auth as unknown) as Record<string, unknown>;

  internals._serverUrl = 'http://localhost:8888/lab';
  internals._onComplete = onComplete;
  internals._onCancel = onCancel;
  internals._window = window;
  internals._popups = new Set([popup]);
  internals._timeout = null;
  internals._timeoutMs = timeoutMs;
  internals._settled = false;

  return { auth, internals, onComplete, onCancel, window, popup };
}

const call = (auth: AuthWindow, name: string, ...args: unknown[]) =>
  ((auth as unknown) as Record<string, (...a: unknown[]) => unknown>)[name](
    ...args
  );

describe('AuthWindow state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('takes its popups down when the chain completes', () => {
    const { auth, onComplete, window, popup } = makeAuthWindow();

    call(auth, '_complete');

    expect(onComplete).toHaveBeenCalledOnce();
    expect(window.destroyed).toBe(true);
    expect(popup.destroyed).toBe(true);
  });

  it('reports a timeout once and not as a completion', () => {
    const { auth, onComplete, onCancel, popup } = makeAuthWindow(1000);

    call(auth, '_resetTimeout', 1000);
    vi.advanceTimersByTime(1000);

    expect(onCancel).toHaveBeenCalledWith('Sign-in did not complete in time');
    expect(onComplete).not.toHaveBeenCalled();
    expect(popup.destroyed).toBe(true);
  });

  it('does not fire a second outcome once one has been reported', () => {
    const { auth, onComplete, onCancel } = makeAuthWindow(1000);

    call(auth, '_resetTimeout', 1000);
    call(auth, '_complete');
    vi.advanceTimersByTime(5000);

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('re-arms the timeout so a slow chain is not cut off mid-way', () => {
    const { auth, onCancel } = makeAuthWindow(1000);

    call(auth, '_resetTimeout', 1000);
    vi.advanceTimersByTime(900);
    call(auth, '_resetTimeout', 1000);
    vi.advanceTimersByTime(900);

    expect(onCancel).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('ignores a timer that survives whatever settled the window', () => {
    const { auth, internals, onCancel } = makeAuthWindow(1000);

    call(auth, '_resetTimeout', 1000);
    // settle without going through _complete, which is what clears the timer:
    // the guard inside the callback is the only thing left to stop a late fire
    internals._settled = true;
    vi.advanceTimersByTime(1000);

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('leaves no timer running after dispose', () => {
    const { auth, internals, onCancel } = makeAuthWindow(1000);

    call(auth, '_resetTimeout', 1000);
    auth.dispose();
    vi.advanceTimersByTime(5000);

    expect(onCancel).not.toHaveBeenCalled();
    expect(internals._timeout).toBeNull();
  });
});
