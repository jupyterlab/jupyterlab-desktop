import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app, shell } from 'electron';
import {
  guardAppOwnedView,
  installGlobalNavigationGuard,
  markGuarded,
  openUrlInSystemBrowser
} from '../../src/main/navigationguard';

interface IFakeContents {
  on: (name: string, listener: (...args: any[]) => void) => void;
  setWindowOpenHandler: (handler: (details: { url: string }) => any) => void;
  emit: (name: string, ...args: any[]) => void;
  openWindow: (url: string) => any;
}

function fakeContents(): IFakeContents {
  const listeners = new Map<string, ((...args: any[]) => void)[]>();
  let openHandler: (details: { url: string }) => any = () => undefined;

  return {
    on(name, listener) {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
    },
    setWindowOpenHandler(handler) {
      openHandler = handler;
    },
    emit(name, ...args) {
      (listeners.get(name) ?? []).forEach(listener => listener(...args));
    },
    openWindow(url) {
      return openHandler({ url });
    }
  };
}

// electron passes the event object carrying the url, not positional arguments
const navigationEvent = (url = 'https://example.com/') => ({
  preventDefault: vi.fn(),
  url
});

// will-frame-navigate carries isMainFrame; will-navigate does not fire at all
// for a subframe
const frameNavigationEvent = (
  isMainFrame: boolean,
  url = 'https://example.com/'
) => ({ preventDefault: vi.fn(), url, isMainFrame });

describe('openUrlInSystemBrowser', () => {
  beforeEach(() => {
    vi.mocked(shell.openExternal).mockClear();
  });

  it.each(['https://example.com/', 'http://example.com/', 'mailto:a@b.c'])(
    'opens %s',
    url => {
      openUrlInSystemBrowser(url);

      expect(shell.openExternal).toHaveBeenCalledOnce();
    }
  );

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'not a url'])(
    'leaves %s unopened',
    url => {
      openUrlInSystemBrowser(url);

      expect(shell.openExternal).not.toHaveBeenCalled();
    }
  );
});

describe('guardAppOwnedView', () => {
  beforeEach(() => {
    vi.mocked(shell.openExternal).mockClear();
  });

  it('keeps the view on its own document and sends the link to the browser', () => {
    const contents = fakeContents();
    guardAppOwnedView(contents as any);
    const event = navigationEvent();

    contents.emit('will-navigate', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(shell.openExternal).toHaveBeenCalledOnce();
  });

  it('guards a server-issued redirect the same way', () => {
    const contents = fakeContents();
    guardAppOwnedView(contents as any);
    const event = navigationEvent();

    contents.emit('will-redirect', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('denies window creation and hands the target to the browser', () => {
    const contents = fakeContents();
    guardAppOwnedView(contents as any);

    expect(contents.openWindow('https://example.com/')).toEqual({
      action: 'deny'
    });
    expect(shell.openExternal).toHaveBeenCalledOnce();
  });

  it('blocks a subframe rather than handing its target to the browser', () => {
    const contents = fakeContents();
    guardAppOwnedView(contents as any);
    const event = frameNavigationEvent(false);

    contents.emit('will-frame-navigate', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('leaves the main frame to will-navigate so nothing opens twice', () => {
    const contents = fakeContents();
    guardAppOwnedView(contents as any);
    const event = frameNavigationEvent(true);

    contents.emit('will-frame-navigate', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('prevents navigation without opening anything for an unsafe scheme', () => {
    const contents = fakeContents();
    guardAppOwnedView(contents as any);
    const event = navigationEvent('file:///etc/passwd');

    contents.emit('will-navigate', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});

describe('installGlobalNavigationGuard', () => {
  let created: (event: unknown, contents: any) => void;

  beforeEach(() => {
    vi.mocked(app.on).mockClear();
    installGlobalNavigationGuard();
    created = vi
      .mocked(app.on)
      .mock.calls.find(call => call[0] === 'web-contents-created')?.[1] as any;
  });

  it('registers itself for every webContents the app creates', () => {
    expect(created).toBeTypeOf('function');
  });

  it('prevents navigation in a view nobody claimed', () => {
    const contents = fakeContents();
    created(null, contents);
    const event = navigationEvent();

    contents.emit('will-navigate', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('leaves a claimed view to its own policy', () => {
    const contents = fakeContents();
    created(null, contents);
    markGuarded(contents as any);
    const event = navigationEvent();

    contents.emit('will-navigate', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('prevents a subframe navigating in a view nobody claimed', () => {
    const contents = fakeContents();
    created(null, contents);
    const event = frameNavigationEvent(false);

    contents.emit('will-frame-navigate', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('leaves a claimed view its own subframes', () => {
    const contents = fakeContents();
    created(null, contents);
    markGuarded(contents as any);
    const event = frameNavigationEvent(false);

    contents.emit('will-frame-navigate', event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('denies window creation from a view nobody claimed', () => {
    const contents = fakeContents();
    created(null, contents);

    expect(contents.openWindow('https://example.com/')).toEqual({
      action: 'deny'
    });
  });

  it('refuses to attach a webview even in a claimed view', () => {
    const contents = fakeContents();
    created(null, contents);
    markGuarded(contents as any);
    const event = navigationEvent();

    contents.emit('will-attach-webview', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});
