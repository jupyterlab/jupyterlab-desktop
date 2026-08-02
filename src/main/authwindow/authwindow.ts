// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { BrowserWindow, Session } from 'electron';
import log from 'electron-log';
import { IDisposable } from '../tokens';
import { guardNavigation, markGuarded } from '../navigationguard';
import { isSameServerOrigin, matchesScheme } from '../utils';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export namespace AuthWindow {
  export interface IOptions {
    session: Session;
    parent: BrowserWindow;
    startUrl: string;
    serverUrl: string;
    timeoutMs?: number;
    onComplete: () => void;
    onCancel: (reason: string) => void;
  }
}

/**
 * Runs a sign-in chain the server started, outside the lab view. The window
 * shares the lab view session so the cookie the provider sets is the one the
 * lab view will send, but it carries no preload and no IPC, so the page the
 * provider renders never sits in front of the privileged surface. It closes
 * itself as soon as the chain lands back on the server origin.
 */
export class AuthWindow implements IDisposable {
  constructor(options: AuthWindow.IOptions) {
    this._serverUrl = options.serverUrl;
    this._onComplete = options.onComplete;
    this._onCancel = options.onCancel;

    this._window = new BrowserWindow({
      parent: options.parent,
      width: 800,
      height: 700,
      title: 'Sign in',
      show: false,
      webPreferences: {
        session: options.session,
        sandbox: true,
        contextIsolation: true
      }
    });

    this._window.setMenuBarVisibility(false);
    this._window.once('ready-to-show', () => this._window?.show());
    this._window.on('closed', () => {
      this._window = null;
      this._clearTimeout();
      this._destroyPopups();
      if (!this._settled) {
        this._settled = true;
        this._onCancel('Sign-in window was closed');
      }
    });

    this._wire(this._window);
    this._resetTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    // navigation events decide the outcome; a redirect chain rejects this load
    void this._window.webContents.loadURL(options.startUrl).catch(error => {
      log.debug('sign-in window initial load rejected', error);
    });
  }

  navigate(url: string): void {
    if (!this._window) {
      return;
    }
    void this._window.webContents.loadURL(url).catch(error => {
      log.debug('sign-in window navigation failed', error);
    });
  }

  dispose(): Promise<void> {
    this._settled = true;
    this._teardown();
    return Promise.resolve();
  }

  private _wire(window: BrowserWindow): void {
    const contents = window.webContents;

    contents.on('did-navigate', (_event, url) => {
      // a settled chain has already cleared its timer, and an orphaned popup
      // navigating must not arm a new one that outlives the window
      if (!this._settled) {
        this._resetTimeout(this._timeoutMs);
      }
      this._showCurrentHost(window);
      if (isSameServerOrigin(url, this._serverUrl)) {
        this._complete();
      }
    });

    // the title is the only thing telling the user whose sign-in page this is,
    // so keep the page from renaming the window out from under it
    window.on('page-title-updated', event => {
      event.preventDefault();
      this._showCurrentHost(window);
    });

    // the policy only lets an http(s) redirect open this window, and the window
    // keeps that true for the rest of the chain: a provider page must not send
    // it, or anything it opens, to file:, data: or a custom scheme
    markGuarded(contents);
    guardNavigation(contents, url =>
      matchesScheme(url, 'http:', 'https:') ? 'allow' : 'deny'
    );

    // a popped-up login needs somewhere unprivileged on this same session
    contents.setWindowOpenHandler(({ url }) => {
      if (!matchesScheme(url, 'http:', 'https:')) {
        log.debug(`Blocked a window opening ${url} from the sign-in window`);
        return { action: 'deny' };
      }
      return {
        action: 'allow',
        createWindow: options => {
          const popup = new BrowserWindow({
            ...options,
            parent: this._window ?? undefined,
            webPreferences: {
              session: contents.session,
              sandbox: true,
              contextIsolation: true
            }
          });
          this._popups.add(popup);
          popup.on('closed', () => this._popups.delete(popup));
          this._wire(popup);
          return popup.webContents;
        }
      };
    });
  }

  private _showCurrentHost(window: BrowserWindow): void {
    if (window.isDestroyed()) {
      return;
    }
    try {
      window.setTitle(`Sign in - ${new URL(window.webContents.getURL()).host}`);
    } catch {
      window.setTitle('Sign in');
    }
  }

  private _destroyPopups(): void {
    for (const popup of this._popups) {
      if (!popup.isDestroyed()) {
        popup.destroy();
      }
    }
    this._popups.clear();
  }

  private _complete(): void {
    if (this._settled) {
      return;
    }
    this._settled = true;
    const onComplete = this._onComplete;
    this._teardown();
    onComplete();
  }

  // every exit takes the popups with it: the chain can finish or stall in one
  // of them, and nothing else owns their lifetime
  private _teardown(): void {
    this._clearTimeout();
    this._destroyPopups();
    if (this._window && !this._window.isDestroyed()) {
      this._window.destroy();
    }
    this._window = null;
  }

  private _resetTimeout(timeoutMs: number): void {
    this._timeoutMs = timeoutMs;
    this._clearTimeout();
    this._timeout = setTimeout(() => {
      if (this._settled) {
        return;
      }
      this._settled = true;
      const onCancel = this._onCancel;
      this._teardown();
      onCancel('Sign-in did not complete in time');
    }, timeoutMs);
  }

  private _clearTimeout(): void {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }

  private _window: BrowserWindow | null;
  private _popups = new Set<BrowserWindow>();
  private _serverUrl: string;
  private _onComplete: () => void;
  private _onCancel: (reason: string) => void;
  private _timeout: NodeJS.Timeout | null = null;
  private _timeoutMs = DEFAULT_TIMEOUT_MS;
  private _settled = false;
}
