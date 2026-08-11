// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

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
  serverUrl: string | undefined | null;
}

/**
 * Decide a permission request. Electron grants everything silently when no
 * handler is installed, so anything off the Jupyter server origin is refused
 * here.
 */
export function isPermissionAllowed({
  permission,
  requestingUrl,
  serverUrl
}: IPermissionRequest): boolean {
  if (!isSameServerOrigin(requestingUrl, serverUrl)) {
    return false;
  }

  return SERVER_ORIGIN_PERMISSIONS[permission] === true;
}
