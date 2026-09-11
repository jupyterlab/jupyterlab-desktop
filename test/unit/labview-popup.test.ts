import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app, shell } from 'electron';
import { LabView } from '../../src/main/labview/labview';
import { installGlobalNavigationGuard } from '../../src/main/navigationguard';

type Listener = (...args: any[]) => void;

const SERVER = 'http://localhost:8888/lab';
// nbconvert export popup URL.
const EXPORT = 'http://localhost:8888/nbconvert/html/a.ipynb?download=true';

// Minimal WebContents stub with a controllable popup handler.
function fakeContents() {
  const listeners = new Map<string, Listener[]>();
  let openHandler: (details: { url: string }) => any = () => undefined;

  const contents = {
    on(name: string, listener: Listener) {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
      return contents;
    },
    setWindowOpenHandler(handler: (details: { url: string }) => any) {
      openHandler = handler;
    },
    emit(name: string, ...args: any[]) {
      [...(listeners.get(name) ?? [])].forEach(listener => listener(...args));
    },
    openWindow(url: string) {
      return openHandler({ url });
    }
  };

  return contents;
}

// Exercise the guard without constructing a real WebContentsView.
function makeLabView() {
  const contents = fakeContents();
  const labView: any = Object.create(LabView.prototype);
  labView._view = { webContents: contents };
  labView._sessionConfig = { url: new URL(SERVER) };
  labView._registerNavigationGuard();
  return { labView, contents };
}

const navigationEvent = (url: string, isMainFrame = true) => ({
  preventDefault: vi.fn(),
  url,
  isMainFrame
});

describe('LabView window open handler', () => {
  beforeEach(() => {
    vi.mocked(shell.openExternal).mockClear();
  });

  it('allows a popup that stays on the Jupyter server origin', () => {
    const { contents } = makeLabView();

    expect(contents.openWindow(EXPORT)).toEqual({ action: 'allow' });
  });

  it('refuses an off-origin popup and hands the target to the browser', () => {
    const { contents } = makeLabView();

    expect(contents.openWindow('https://example.com/')).toEqual({
      action: 'deny'
    });
    expect(shell.openExternal).toHaveBeenCalledOnce();
  });
});

// Regression: an allowed popup must also be claimed from the global guard (#1134).
describe('a popup the LabView allowed, against the application-wide guard', () => {
  let created: (event: unknown, contents: any) => void;

  beforeEach(() => {
    vi.mocked(app.on).mockClear();
    vi.mocked(shell.openExternal).mockClear();
    installGlobalNavigationGuard();
    created = vi
      .mocked(app.on)
      .mock.calls.find(call => call[0] === 'web-contents-created')?.[1] as any;
  });

  // Electron creates the child before did-create-window and its first navigation.
  function openPopup(url: string) {
    const { labView, contents: parent } = makeLabView();
    const child = fakeContents();
    parent.openWindow(url);
    created(null, child);
    parent.emit('did-create-window', { webContents: child });
    return { child, labView };
  }

  it('lets the popup reach the URL it was opened for', () => {
    const { child } = openPopup(EXPORT);
    const event = navigationEvent(EXPORT);

    child.emit('will-navigate', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('keeps the popup on the server origin once it is open', () => {
    const { child } = openPopup(EXPORT);
    const event = navigationEvent('https://example.com/');

    child.emit('will-navigate', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(shell.openExternal).toHaveBeenCalledOnce();
  });

  it('starts the auth chain when the popup is redirected away', () => {
    const { child, labView } = openPopup(EXPORT);
    const event = navigationEvent('https://login.example.com/');
    labView._runAuthChain = vi.fn();

    child.emit('will-redirect', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(labView._runAuthChain).toHaveBeenCalledWith(
      'https://login.example.com/'
    );
  });

  it('refuses a popup of its own, which nothing has claimed', () => {
    const { child } = openPopup(EXPORT);

    expect(child.openWindow(EXPORT)).toEqual({ action: 'deny' });
  });
});
