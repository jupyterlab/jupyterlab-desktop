// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { app, shell, WebContents } from 'electron';
import log from 'electron-log';
import { matchesScheme } from './utils';

const guarded = new WeakSet<WebContents>();

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
    // the parsed href, so whitespace and control characters never reach the OS
    shell.openExternal(new URL(url).href);
  }
}

/**
 * Apply a navigation policy to a webContents: the wiring lives here, the caller
 * brings the rule. Window creation stays with the caller, since what a surface
 * does with a popup varies more than a verdict can express.
 */
export function guardNavigation(
  contents: WebContents,
  decide: (url: string) => NavigationDecision
): void {
  const handle = (
    details: Electron.Event & { url: string; isMainFrame: boolean }
  ) => {
    const decision = decide(details.url);
    if (decision === 'allow') {
      return;
    }
    details.preventDefault();
    // only the main frame's target is a place the user asked to go; a subframe
    // is part of a page's own layout, so its target is refused, not handed out
    if (decision === 'external' && details.isMainFrame) {
      openUrlInSystemBrowser(details.url);
    } else if (!details.isMainFrame) {
      // a surface refusing a subframe is the policy working, not a fault
      log.debug(`Blocked subframe navigation to ${details.url}`);
    } else {
      log.warn(`Blocked navigation to ${details.url}`);
    }
  };

  contents.on('will-navigate', handle);
  contents.on('will-redirect', handle);

  // will-navigate never fires for a subframe, will-frame-navigate fires for
  // every frame, so the main frame would otherwise be handled twice
  contents.on('will-frame-navigate', details => {
    if (!details.isMainFrame) {
      handle(details);
    }
  });

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
