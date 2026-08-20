// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import type { WebContents } from 'electron';
import { isSameServerOrigin } from './utils';

// What the Jupyter server origin may have, and why. Anything absent is refused,
// as is everything for any other origin.
const SERVER_ORIGIN_PERMISSIONS: Record<string, boolean> = {
  'clipboard-read': true, // JupyterLab copies and pastes cells through it
  'clipboard-sanitized-write': true,
  fullscreen: true, // presentations
  notifications: true, // extensions report long running work
  media: false, // a remote server's page must not reach camera or microphone
  geolocation: false,
  'display-capture': false,
  'idle-detection': false
};

export interface IPermissionRequest {
  permission: string;
  requestingUrl: string | undefined | null;
  // every Jupyter server origin currently open, since a check can arrive with
  // no way to say which window it belongs to
  serverUrls: readonly (string | undefined | null)[];
}

/**
 * Decide a permission request. Electron grants everything silently when no
 * handler is installed, so anything off the Jupyter server origin is refused
 * here.
 */
export function isPermissionAllowed({
  permission,
  requestingUrl,
  serverUrls
}: IPermissionRequest): boolean {
  if (
    !serverUrls.some(serverUrl => isSameServerOrigin(requestingUrl, serverUrl))
  ) {
    return false;
  }

  return SERVER_ORIGIN_PERMISSIONS[permission] === true;
}

/** One open session window, reduced to what a permission decision needs. */
export interface IServedView {
  // the lab view's webContents, or undefined for a window without one yet
  viewWebContents: WebContents | undefined;
  serverUrl: string | undefined;
}

/**
 * The server origins a permission request may be measured against.
 *
 * A check handler can be called with no webContents at all: notification and
 * worker checks reach Electron without a frame host, which the 13.0 breaking
 * change describes as passing null and points at requestingOrigin instead.
 * Narrowing to a single window is not possible there, so every open server
 * counts. Those are origins the user connected to by hand, and the origin
 * being matched comes from Chromium rather than from the page.
 */
export function serverUrlsForRequest(
  webContents: WebContents | null,
  views: readonly IServedView[]
): string[] {
  if (webContents) {
    const view = views.find(
      candidate => candidate.viewWebContents === webContents
    );
    // a webContents that is not a lab view, such as the welcome page or a
    // sign-in window, is served by nothing and gets nothing
    return view?.serverUrl ? [view.serverUrl] : [];
  }

  return views
    .map(view => view.serverUrl)
    .filter((url): url is string => !!url);
}
