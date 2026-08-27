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
  afterEach(() => vi.restoreAllMocks());

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
