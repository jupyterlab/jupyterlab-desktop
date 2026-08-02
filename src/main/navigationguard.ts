// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { app, shell, WebContents } from 'electron';
import log from 'electron-log';
import { matchesScheme } from './utils';

const guarded = new WeakSet<WebContents>();

/**
 * What to do with a navigation a surface is about to make: let it happen, hand
 * it to the system browser, or refuse it.
 */
export type NavigationDecision = 'allow' | 'external' | 'deny';

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
  // http and https for ordinary links, mailto for contact links
  if (matchesScheme(url, 'http:', 'https:', 'mailto:')) {
    shell.openExternal(url);
  }
}

/**
 * Apply a navigation policy to a webContents. Every surface wires the same
 * three hooks and differs only in the decision, so the wiring lives here and
 * the caller brings the rule. Window creation is left to the caller, since what
 * a surface does with a popup varies more than a verdict can express.
 */
export function guardNavigation(
  contents: WebContents,
  decide: (url: string) => NavigationDecision
): void {
  const handle = (details: Electron.Event & { url: string }) => {
    const decision = decide(details.url);
    if (decision === 'allow') {
      return;
    }
    details.preventDefault();
    if (decision === 'external') {
      openUrlInSystemBrowser(details.url);
    } else {
      log.debug(`Blocked navigation to ${details.url}`);
    }
  };

  contents.on('will-navigate', handle);
  contents.on('will-redirect', handle);
  contents.on('will-attach-webview', event => {
    event.preventDefault();
  });
}

/**
 * Pin a view that renders a bundled document. Those views are built from a
 * data: URL and are never meant to navigate: keeping them on their own document
 * means a link in content they render, the news feed on the welcome page for
 * instance, cannot replace app chrome with a page from the network.
 */
export function guardAppOwnedView(contents: WebContents): void {
  markGuarded(contents);
  guardNavigation(contents, () => 'external');
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
    guardNavigation(contents, () => (guarded.has(contents) ? 'allow' : 'deny'));

    // an owner that sets its own handler replaces this one, which is what
    // claiming a view looks like for window creation
    contents.setWindowOpenHandler(({ url }) => {
      log.warn(`Blocked window opening ${url} from an unguarded view`);
      return { action: 'deny' };
    });
  });
}
