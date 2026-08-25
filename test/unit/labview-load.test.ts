import { describe, expect, it, vi } from 'vitest';
import { LabView } from '../../src/main/labview/labview';

// net::ERR_ABORTED and net::ERR_NAME_NOT_RESOLVED
const ABORTED = -3;
const UNREACHABLE = -105;

type Listener = (...args: any[]) => void;

// An EventEmitter narrow enough to stand in for webContents, with the once/off
// pairing the code under test relies on.
function fakeContents() {
  const listeners = new Map<string, Listener[]>();
  const wrappers = new Map<Listener, Listener>();

  const contents = {
    loadURL: vi.fn(),
    on(name: string, listener: Listener) {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
      return contents;
    },
    once(name: string, listener: Listener) {
      const wrapper = (...args: any[]) => {
        contents.off(name, listener);
        listener(...args);
      };
      wrappers.set(listener, wrapper);
      return contents.on(name, wrapper);
    },
    off(name: string, listener: Listener) {
      const registered = wrappers.get(listener) ?? listener;
      listeners.set(
        name,
        (listeners.get(name) ?? []).filter(each => each !== registered)
      );
      return contents;
    },
    emit(name: string, ...args: any[]) {
      [...(listeners.get(name) ?? [])].forEach(listener => listener(...args));
    }
  };

  return contents;
}

// Drive the real load() without the heavy constructor: an instance linked to
// the prototype, carrying only the fields the method reads.
function makeLabView(authWindow: unknown = null) {
  const contents = fakeContents();
  const labView: any = Object.create(LabView.prototype);
  labView._view = { webContents: contents };
  labView._sessionConfig = { url: new URL('http://localhost:8888/lab') };
  labView._authWindow = authWindow;
  return { labView, contents };
}

const failure = (errorCode: number, isMainFrame: boolean) => [
  {},
  errorCode,
  'load failed',
  'http://localhost:8888/lab',
  isMainFrame
];

describe('LabView.load', () => {
  it('reports a main frame failure to the caller', () => {
    const { labView, contents } = makeLabView();
    const errorCallback = vi.fn();
    labView.load(errorCallback);

    contents.emit('did-fail-load', ...failure(UNREACHABLE, true));

    expect(errorCallback).toHaveBeenCalledWith(UNREACHABLE, 'load failed');
  });

  it('still reports the main frame after a subframe failed to load', () => {
    const { labView, contents } = makeLabView();
    const errorCallback = vi.fn();
    labView.load(errorCallback);

    contents.emit('did-fail-load', ...failure(UNREACHABLE, false));
    contents.emit('did-fail-load', ...failure(UNREACHABLE, true));

    expect(errorCallback).toHaveBeenCalledOnce();
  });

  it('stops reporting once JupyterLab has come up', () => {
    const { labView, contents } = makeLabView();
    const errorCallback = vi.fn();
    labView.load(errorCallback);

    contents.emit('did-finish-load');
    contents.emit('did-fail-load', ...failure(UNREACHABLE, true));

    expect(errorCallback).not.toHaveBeenCalled();
  });

  it('leaves an aborted load to the sign-in window that caused it', () => {
    const { labView, contents } = makeLabView({});
    const errorCallback = vi.fn();
    labView.load(errorCallback);

    contents.emit('did-fail-load', ...failure(ABORTED, true));

    expect(errorCallback).not.toHaveBeenCalled();
  });

  it('reports an aborted load when no sign-in window is running', () => {
    const { labView, contents } = makeLabView();
    const errorCallback = vi.fn();
    labView.load(errorCallback);

    contents.emit('did-fail-load', ...failure(ABORTED, true));

    expect(errorCallback).toHaveBeenCalledWith(ABORTED, 'load failed');
  });
});
