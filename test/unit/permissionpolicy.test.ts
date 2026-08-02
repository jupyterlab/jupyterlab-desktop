import { describe, expect, it } from 'vitest';
import { isPermissionAllowed } from '../../src/main/permissionpolicy';

const server = 'http://localhost:8888/lab?token=secret';

const ask = (permission: string, requestingUrl: string | undefined) =>
  isPermissionAllowed({ permission, requestingUrl, serverUrl: server });

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
        serverUrl: server
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
        serverUrl: undefined
      })
    ).toBe(false);
  });
});
