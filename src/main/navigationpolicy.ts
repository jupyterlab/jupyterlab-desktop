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
  // renderer initiated (link click, window.open, location assignment) versus
  // server initiated (an HTTP redirect the page did not ask for)
  kind: 'navigate' | 'redirect';
}

/**
 * Decide where a lab view navigation should happen. The lab view is privileged
 * and stays on the Jupyter server origin: content the server serves loads in
 * it, and a link the user follows out of that content goes to the system
 * browser. A redirect the server itself issues to another origin is the start
 * of a sign-in chain, which runs in a separate unprivileged window on the same
 * session so the cookie lands where the lab view will read it.
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

  // a sign-in chain is only ever carried over the web
  if (kind === 'redirect' && matchesScheme(target, 'http:', 'https:')) {
    return 'auth-window';
  }

  // http and https for ordinary links, mailto for notebook contact links
  return matchesScheme(target, 'http:', 'https:', 'mailto:')
    ? 'external'
    : 'block';
}
