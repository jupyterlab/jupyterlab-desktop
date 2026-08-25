// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { matchesScheme, originOf } from './utils';

export type NavigationVerdict =
  | 'in-view'
  | 'auth-window'
  | 'external'
  | 'block';

export interface INavigationRequest {
  target: string;
  serverUrl: string | undefined | null;
  // renderer initiated (a link, window.open) versus server initiated (a
  // redirect the page did not ask for)
  kind: 'navigate' | 'redirect';
}

/**
 * Decide where a lab view navigation should happen. The view stays on the
 * Jupyter server origin, a link followed out of that content goes to the
 * system browser, and a server-issued redirect off-origin is a sign-in chain.
 */
export function classifyNavigation({
  target,
  serverUrl,
  kind
}: INavigationRequest): NavigationVerdict {
  const serverOrigin = originOf(serverUrl);
  // with no origin to compare against, no navigation can be placed anywhere
  if (serverOrigin === null) {
    return 'block';
  }

  if (originOf(target) === serverOrigin) {
    return 'in-view';
  }

  // a sign-in chain is only ever carried over the web, and never drops to
  // cleartext from a server reached over TLS: that window is where credentials
  // get typed. A server already on http is cleartext either way, so refusing
  // there would buy nothing.
  if (kind === 'redirect' && matchesScheme(target, 'http:', 'https:')) {
    const leavesTLS =
      matchesScheme(serverUrl ?? '', 'https:') &&
      matchesScheme(target, 'http:');
    return leavesTLS ? 'block' : 'auth-window';
  }

  // http and https for ordinary links, mailto for notebook contact links
  return matchesScheme(target, 'http:', 'https:', 'mailto:')
    ? 'external'
    : 'block';
}
