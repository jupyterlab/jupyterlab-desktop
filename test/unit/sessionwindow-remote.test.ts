import { afterEach, describe, expect, it, vi } from 'vitest';
import { appData } from '../../src/main/config/appdata';
import { SessionWindow } from '../../src/main/sessionwindow/sessionwindow';

function makeWindow(): any {
  const win = Object.create(SessionWindow.prototype);
  win._showProgressView = vi.fn();
  win._updateContentView = vi.fn();
  win._hideProgressView = vi.fn();
  win._updateSessionWindowPositionConfig = vi.fn();
  win._sessionConfigChanged = { emit: vi.fn() };
  return win;
}

describe('SessionWindow remote credentials', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    appData.recentSessions = [];
  });

  it('uses a supplied URL over credentials persisted for the same server', async () => {
    vi.spyOn(appData, 'addRemoteURLToRecents').mockImplementation(() => {});
    vi.spyOn(appData, 'addSessionToRecents').mockResolvedValue();
    const win = makeWindow();
    await win._createSessionForRemoteUrl(
      'https://example.com/lab?token=new',
      true,
      'persist:example',
      Buffer.from('https://example.com/lab?token=old').toString('base64')
    );
    expect(win.sessionConfig.url.href).toContain('token=new');
    expect(
      Buffer.from(win.sessionConfig.encryptedRemoteURL, 'base64').toString()
    ).toContain('token=new');
  });

  it('reconnects from the credential stored for a server when the caller has none', async () => {
    // What the remote server dialog sends when its recents entry is clicked:
    // the canonical URL, no credential. Without the lookup the session connects
    // with no token and the stored credential is replaced by a token-free one.
    const stored = Buffer.from('https://example.com/lab?token=stored').toString(
      'base64'
    );
    appData.recentSessions = [
      {
        remoteURL: 'https://example.com/lab',
        filesToOpen: [],
        persistSessionData: true,
        partition: 'persist:example',
        encryptedRemoteURL: stored,
        date: new Date()
      }
    ];
    vi.spyOn(appData, 'addRemoteURLToRecents').mockImplementation(() => {});
    vi.spyOn(appData, 'addSessionToRecents').mockResolvedValue();
    const win = makeWindow();
    await win._createSessionForRemoteUrl(
      'https://example.com/lab',
      true,
      undefined
    );
    expect(win.sessionConfig.url.href).toContain('token=stored');
    expect(appData.addSessionToRecents).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedRemoteURL: stored })
    );
  });

  it('ignores the stored credential for a non-persistent session', async () => {
    appData.recentSessions = [
      {
        remoteURL: 'https://example.com/lab',
        filesToOpen: [],
        persistSessionData: true,
        partition: 'persist:example',
        encryptedRemoteURL: Buffer.from(
          'https://example.com/lab?token=stored'
        ).toString('base64'),
        date: new Date()
      }
    ];
    vi.spyOn(appData, 'addRemoteURLToRecents').mockImplementation(() => {});
    vi.spyOn(appData, 'addSessionToRecents').mockResolvedValue();
    const win = makeWindow();
    await win._createSessionForRemoteUrl(
      'https://example.com/lab',
      false,
      undefined
    );
    expect(win.sessionConfig.url.href).not.toContain('token');
    expect(win.sessionConfig.encryptedRemoteURL).toBeUndefined();
  });

  it('decrypts credentials only when reopening a canonical stored URL', async () => {
    vi.spyOn(appData, 'addRemoteURLToRecents').mockImplementation(() => {});
    vi.spyOn(appData, 'addSessionToRecents').mockResolvedValue();
    const win = makeWindow();
    await win._createSessionForRemoteUrl(
      'https://example.com/lab',
      true,
      'persist:example',
      Buffer.from('https://example.com/lab?token=stored').toString('base64')
    );
    expect(win.sessionConfig.url.href).toContain('token=stored');
    expect(appData.addSessionToRecents).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteURL: 'https://example.com/lab',
        encryptedRemoteURL: expect.any(String)
      })
    );
  });
});
