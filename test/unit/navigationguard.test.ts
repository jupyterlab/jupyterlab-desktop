import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { app, shell } from 'electron';
import {
  guardAppOwnedView,
  installGlobalNavigationGuard,
  markGuarded,
  openUrlInSystemBrowser
} from '../../src/main/navigationguard';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return full.endsWith('.ts') ? [full] : [];
  });
}

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
const navigationEvent = (url = 'https://example.com/', isMainFrame = true) => ({
  preventDefault: vi.fn(),
  url,
  isMainFrame
});

const subframeEvent = (url = 'https://example.com/') =>
  navigationEvent(url, false);

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
    const event = subframeEvent();

    contents.emit('will-frame-navigate', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('blocks a subframe redirect rather than opening it in the browser', () => {
    const contents = fakeContents();
    guardAppOwnedView(contents as any);
    const event = subframeEvent();

    contents.emit('will-redirect', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  it('leaves the main frame to will-navigate so nothing opens twice', () => {
    const contents = fakeContents();
    guardAppOwnedView(contents as any);
    const event = navigationEvent();

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
    const event = subframeEvent();

    contents.emit('will-frame-navigate', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('leaves a claimed view its own subframes', () => {
    const contents = fakeContents();
    created(null, contents);
    markGuarded(contents as any);
    const event = subframeEvent();

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

  it('still denies window creation from a view that claimed navigation', () => {
    const contents = fakeContents();
    created(null, contents);
    markGuarded(contents as any);

    // marking a view exempts its navigations, not its popups: the owner has to
    // set its own handler, which is what the source check below is about
    expect(contents.openWindow('https://example.com/')).toEqual({
      action: 'deny'
    });
  });
});

describe('every surface that claims navigation also declares a popup policy', () => {
  // markGuarded only exempts navigation. A view that claims it and then leaves
  // setWindowOpenHandler alone keeps the global deny-all, so a login that pops
  // a window dies with nothing on screen. connect.ts shipped that way.
  it.each(['connect.ts', 'labview/labview.ts', 'authwindow/authwindow.ts'])(
    '%s sets its own window open handler',
    file => {
      const source = readFileSync(
        join(__dirname, '../../src/main', file),
        'utf8'
      );

      expect(source).toContain('markGuarded(');
      expect(source).toContain('setWindowOpenHandler(');
    }
  );

  it('names every direct caller of markGuarded', () => {
    const root = join(__dirname, '../../src/main');
    const callers = walk(root).filter(file => {
      const source = readFileSync(file, 'utf8');
      return (
        !file.endsWith('navigationguard.ts') && /\bmarkGuarded\(/.test(source)
      );
    });

    expect(callers.map(file => relative(root, file)).sort()).toEqual([
      'authwindow/authwindow.ts',
      'connect.ts',
      'labview/labview.ts'
    ]);
  });
});
