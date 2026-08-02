// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { app, shell, WebContents } from 'electron';
import log from 'electron-log';

// http/https for ordinary links, mailto for contact links
const EXTERNAL_SCHEMES = ['https:', 'http:', 'mailto:'];

const guarded = new WeakSet<WebContents>();

/**
 * Declare that this webContents carries its own navigation policy, so the
 * application-wide guard leaves its navigations alone. The lab view decides per
 * origin, and the server connection window has to follow a login wherever it
 * goes.
 */
export function markGuarded(contents: WebContents): void {
  guarded.add(contents);
}

export function openUrlInSystemBrowser(url: string): void {
  try {
    const { protocol, href } = new URL(url);
    if (EXTERNAL_SCHEMES.includes(protocol)) {
      shell.openExternal(href);
    }
  } catch {
    // unparseable target, nothing safe to open
  }
}

/**
 * Pin a view that renders a bundled document. Those views are built from a
 * data: URL and are never meant to navigate: keeping them on their own document
 * means a link in content they render, the news feed on the welcome page for
 * instance, cannot replace app chrome with a page from the network.
 */
export function guardAppOwnedView(contents: WebContents): void {
  markGuarded(contents);

  const sendToBrowser = (event: Electron.Event, url: string) => {
    event.preventDefault();
    openUrlInSystemBrowser(url);
  };

  contents.on('will-navigate', sendToBrowser);
  contents.on('will-redirect', sendToBrowser);
  contents.setWindowOpenHandler(({ url }) => {
    openUrlInSystemBrowser(url);
    return { action: 'deny' };
  });
}

/**
 * Deny navigation for any webContents nobody claimed. Views are added over
 * time and the safe default is that a new one cannot be navigated away from its
 * document until someone decides what its policy should be. The check runs when
 * a navigation happens rather than when the webContents is created, because
 * creation fires before the owner has had a chance to claim it.
 */
export function installGlobalNavigationGuard(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', event => {
      event.preventDefault();
    });

    const denyUnclaimed = (event: Electron.Event, url: string) => {
      if (guarded.has(contents)) {
        return;
      }
      event.preventDefault();
      log.warn(`Blocked navigation to ${url} in an unguarded view`);
    };

    contents.on('will-navigate', denyUnclaimed);
    contents.on('will-redirect', denyUnclaimed);

    // an owner that sets its own handler replaces this one, which is what
    // claiming a view looks like for window creation
    contents.setWindowOpenHandler(({ url }) => {
      log.warn(`Blocked window opening ${url} from an unguarded view`);
      return { action: 'deny' };
    });
  });
}
