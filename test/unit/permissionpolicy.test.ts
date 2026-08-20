import { describe, expect, it } from 'vitest';
import {
  isPermissionAllowed,
  serverUrlsForRequest
} from '../../src/main/permissionpolicy';

const server = 'http://localhost:8888/lab?token=secret';

const ask = (permission: string, requestingUrl: string | undefined) =>
  isPermissionAllowed({ permission, requestingUrl, serverUrls: [server] });

describe('isPermissionAllowed', () => {
  it('lets the server origin use the clipboard', () => {
    expect(ask('clipboard-read', 'http://localhost:8888/lab')).toBe(true);
    expect(ask('clipboard-sanitized-write', 'http://localhost:8888/lab')).toBe(
      true
    );
  });

  it('refuses the camera and microphone even on the server origin', () => {
    expect(ask('media', 'http://localhost:8888/lab')).toBe(false);
  });

  it.each(['geolocation', 'hid', 'serial', 'usb', 'display-capture'])(
    'refuses %s on the server origin',
    permission => {
      expect(ask(permission, 'http://localhost:8888/lab')).toBe(false);
    }
  );

  it('refuses an allowlisted permission when it comes from another origin', () => {
    expect(ask('notifications', 'https://accounts.example.com/oauth')).toBe(
      false
    );
    expect(ask('clipboard-read', 'https://accounts.example.com/oauth')).toBe(
      false
    );
  });

  it('refuses a request from a bundled app view, which has no server origin', () => {
    expect(
      isPermissionAllowed({
        permission: 'notifications',
        requestingUrl: 'data:text/html,<h1>welcome</h1>',
        serverUrls: [server]
      })
    ).toBe(false);
  });

  it('refuses everything when the requesting URL is missing or unparseable', () => {
    expect(ask('clipboard-read', undefined)).toBe(false);
    expect(ask('clipboard-read', 'not a url')).toBe(false);
  });

  it('refuses everything when no server origin is known for the sender', () => {
    expect(
      isPermissionAllowed({
        permission: 'clipboard-read',
        requestingUrl: 'http://localhost:8888/lab',
        serverUrls: []
      })
    ).toBe(false);
  });

  // Electron calls the check handler with no webContents for notification and
  // worker checks, so there is no single window to measure against and every
  // open server is offered instead. Matching only the one window would leave
  // Notification.permission reading denied while the request handler had
  // already granted it.
  it('allows notifications from a server origin that no single window pins', () => {
    expect(
      isPermissionAllowed({
        permission: 'notifications',
        requestingUrl: 'http://localhost:9999/lab',
        serverUrls: [server, 'http://localhost:9999/lab?token=other']
      })
    ).toBe(true);
  });

  it('still refuses an origin that is none of the open servers', () => {
    expect(
      isPermissionAllowed({
        permission: 'notifications',
        requestingUrl: 'https://evil.example.com/page',
        serverUrls: [server, 'http://localhost:9999/lab?token=other']
      })
    ).toBe(false);
  });

  it('ignores an open window that has no server yet', () => {
    expect(
      isPermissionAllowed({
        permission: 'clipboard-read',
        requestingUrl: 'http://localhost:8888/lab',
        serverUrls: [undefined, server]
      })
    ).toBe(true);
  });
});

describe('serverUrlsForRequest', () => {
  const labView = ({ id: 'lab-view' } as unknown) as Electron.WebContents;
  const otherLabView = ({
    id: 'other-lab-view'
  } as unknown) as Electron.WebContents;
  const views = [
    { viewWebContents: labView, serverUrl: server },
    { viewWebContents: otherLabView, serverUrl: 'http://localhost:9999/lab' }
  ];

  it('narrows to the one window a webContents belongs to', () => {
    expect(serverUrlsForRequest(labView, views)).toEqual([server]);
  });

  // this is the case that made the notifications grant dead: Electron passes
  // no webContents for notification and worker checks, so pinning the request
  // to a single window refuses every one of them
  it('offers every open server when there is no webContents', () => {
    expect(serverUrlsForRequest(null, views)).toEqual([
      server,
      'http://localhost:9999/lab'
    ]);
  });

  it('gives nothing to a webContents that is not a lab view', () => {
    expect(
      serverUrlsForRequest(
        ({ id: 'welcome-page' } as unknown) as Electron.WebContents,
        views
      )
    ).toEqual([]);
  });

  it('gives nothing for a lab view whose server is not up yet', () => {
    expect(
      serverUrlsForRequest(labView, [
        { viewWebContents: labView, serverUrl: undefined }
      ])
    ).toEqual([]);
  });

  it('skips a window with no server when offering all of them', () => {
    expect(
      serverUrlsForRequest(null, [
        { viewWebContents: labView, serverUrl: undefined },
        { viewWebContents: otherLabView, serverUrl: server }
      ])
    ).toEqual([server]);
  });
});
