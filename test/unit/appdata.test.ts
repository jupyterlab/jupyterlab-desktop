import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import { safeStorage, session } from 'electron';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => {
      throw new Error('ENOENT');
    }),
    writeFileSync: vi.fn(),
    chmodSync: vi.fn(),
    mkdirSync: vi.fn()
  };
});

import { appData, ApplicationData } from '../../src/main/config/appdata';
import { SessionConfig } from '../../src/main/config/sessionconfig';

const mockFs = vi.mocked(fs);
const mockSafeStorage = vi.mocked(safeStorage);
const mockSession = vi.mocked(session);

function resetAppData() {
  appData.pythonPath = '';
  appData.condaPath = '';
  appData.systemPythonPath = '';
  appData.recentRemoteURLs = [];
  appData.recentSessions = [];
  appData.discoveredPythonEnvs = [];
  appData.userSetPythonEnvs = [];
  appData.newsList = [];
  appData.sessions = [];
  appData.updateBundledEnvOnRestart = false;
  appData.removedLegacyRemoteTokens = false;
}

describe('ApplicationData.getAppDataPath', () => {
  it('returns a path ending with app-data.json', () => {
    const p = ApplicationData.getAppDataPath();
    expect(p).toMatch(/app-data\.json$/);
  });

  it('includes the userData directory', () => {
    const p = ApplicationData.getAppDataPath();
    expect(p).toContain('jlab-test-userdata');
  });
});

describe('ApplicationData.read', () => {
  beforeEach(() => {
    resetAppData();
  });

  it('does not read or mutate state when the file does not exist', () => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.readFileSync = vi.fn();
    const pythonPathBefore = appData.pythonPath;
    appData.read();
    // the missing-file guard must short-circuit before parsing anything
    expect(mockFs.readFileSync).not.toHaveBeenCalled();
    expect(appData.pythonPath).toBe(pythonPathBefore);
  });

  it('reads pythonPath from JSON', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ pythonPath: '/usr/bin/python3' }))
    );
    appData.read();
    expect(appData.pythonPath).toBe('/usr/bin/python3');
  });

  it('reads condaPath from JSON', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ condaPath: '/opt/conda/bin/conda' }))
    );
    appData.read();
    expect(appData.condaPath).toBe('/opt/conda/bin/conda');
  });

  it('migrates legacy condaRootPath to condaPath', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ condaRootPath: '/opt/conda' }))
    );
    appData.read();
    expect(appData.condaPath).toContain('conda');
    // the derived path keeps the root it migrated from, whichever slash the host joins it with
    expect(appData.condaPath.replace(/\\/g, '/')).toContain('/opt/conda');
  });

  it('removes query parameters from stored remote URLs', () => {
    const date = new Date('2024-01-01').toISOString();
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          sessions: [
            { remoteURL: 'https://example.com/lab?token=session', date }
          ],
          recentSessions: [
            {
              remoteURL: 'https://example.com/lab?token=recent-session',
              date
            }
          ],
          recentRemoteURLs: [
            { url: 'https://example.com/lab?token=recent-url', date }
          ]
        })
      )
    );
    appData.read();
    expect(appData.sessions[0].remoteURL).toBe('https://example.com/lab');
    expect(appData.recentSessions[0].remoteURL).toBe('https://example.com/lab');
    expect(appData.recentRemoteURLs).toHaveLength(1);
    expect(appData.recentRemoteURLs[0].url).toBe('https://example.com/lab');
  });

  it('keeps malformed remote URLs readable without their query', () => {
    const date = new Date('2024-01-01').toISOString();
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          recentRemoteURLs: [{ url: 'not a URL?token=old', date }]
        })
      )
    );
    appData.read();
    expect(appData.recentRemoteURLs[0].url).toBe('not a URL');
  });

  it('migrates legacy remote credentials to encrypted session fields', async () => {
    const date = new Date('2024-01-01').toISOString();
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          sessions: [{ remoteURL: 'https://example.com/lab?token=active' }],
          recentSessions: [
            {
              remoteURL: 'https://example.com/lab?token=recent',
              date
            }
          ]
        })
      )
    );
    mockSafeStorage.isAsyncEncryptionAvailable.mockResolvedValue(true);
    mockSafeStorage.getSelectedStorageBackend.mockReturnValue(
      'gnome_libsecret'
    );
    mockSafeStorage.encryptStringAsync.mockImplementation(value =>
      Promise.resolve(Buffer.from(value))
    );
    appData.read();
    await expect(appData.migrateRemoteCredentials()).resolves.toBe(true);
    appData.save();
    const content = (mockFs.writeFileSync as any).mock.calls[0][1] as string;
    expect(content).not.toContain('token=active');
    expect(content).not.toContain('token=recent');
    expect(content).toContain('encryptedRemoteURL');
  });

  it('reads updateBundledEnvOnRestart flag', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ updateBundledEnvOnRestart: true }))
    );
    appData.read();
    expect(appData.updateBundledEnvOnRestart).toBe(true);
  });
});

describe('ApplicationData.save', () => {
  beforeEach(() => {
    resetAppData();
    mockFs.existsSync = vi.fn(() => false);
    mockFs.writeFileSync = vi.fn();
  });

  it('calls writeFileSync with app-data.json path', () => {
    appData.save();
    expect(mockFs.writeFileSync).toHaveBeenCalledOnce();
    const [writePath] = (mockFs.writeFileSync as any).mock.calls[0];
    expect(writePath).toMatch(/app-data\.json$/);
    expect((mockFs.writeFileSync as any).mock.calls[0][2]).toEqual({
      mode: 0o600
    });
    expect(mockFs.chmodSync).toHaveBeenCalledWith(writePath, 0o600);
  });

  it('omits empty pythonPath from saved JSON', () => {
    appData.pythonPath = '';
    appData.save();
    const content = (mockFs.writeFileSync as any).mock.calls[0][1] as string;
    const json = JSON.parse(content);
    expect(json).not.toHaveProperty('pythonPath');
  });

  it('includes non-empty pythonPath in saved JSON', () => {
    appData.pythonPath = '/usr/bin/python3';
    appData.save();
    const content = (mockFs.writeFileSync as any).mock.calls[0][1] as string;
    const json = JSON.parse(content);
    expect(json.pythonPath).toBe('/usr/bin/python3');
  });

  it('saves remote URLs without query parameters', () => {
    const date = new Date('2024-06-01');
    const session = new SessionConfig();
    session.remoteURL = 'https://example.com/lab?token=session';
    appData.sessions = [session];
    appData.recentRemoteURLs = [
      { url: 'https://example.com/lab?token=recent-url', date }
    ];
    appData.recentSessions = [
      {
        remoteURL: 'https://example.com/lab?token=recent-session',
        filesToOpen: [],
        date
      }
    ];
    appData.save();
    const content = (mockFs.writeFileSync as any).mock.calls[0][1] as string;
    const json = JSON.parse(content);
    expect(json.sessions[0].remoteURL).toBe('https://example.com/lab');
    expect(json.recentSessions[0].remoteURL).toBe('https://example.com/lab');
    expect(json.recentRemoteURLs[0].url).toBe('https://example.com/lab');
    expect(typeof json.recentRemoteURLs[0].date).toBe('string');
  });
});

describe('ApplicationData.migrateRemoteCredentials', () => {
  beforeEach(() => {
    resetAppData();
    mockSafeStorage.isAsyncEncryptionAvailable.mockResolvedValue(true);
    mockSafeStorage.getSelectedStorageBackend.mockReturnValue(
      'gnome_libsecret'
    );
    mockSafeStorage.encryptStringAsync.mockImplementation(value =>
      Promise.resolve(Buffer.from(value))
    );
  });

  function readOneLegacyRow(persistSessionData: boolean) {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          recentSessions: [
            {
              remoteURL: 'https://lab.example.com/lab?token=legacy',
              persistSessionData,
              partition: persistSessionData ? 'persist:one' : undefined,
              date: '2024-01-01T00:00:00.000Z'
            }
          ]
        })
      )
    );
    appData.read();
  }

  it('reports nothing removed when the token could be encrypted', async () => {
    readOneLegacyRow(true);
    await appData.migrateRemoteCredentials();
    expect(appData.recentSessions[0].encryptedRemoteURL).toBeDefined();
    expect(appData.removedLegacyRemoteTokens).toBe(false);
  });

  it('reports the removal when no credential store is available', async () => {
    mockSafeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);
    readOneLegacyRow(true);
    await appData.migrateRemoteCredentials();
    expect(appData.recentSessions[0].encryptedRemoteURL).toBeUndefined();
    expect(appData.removedLegacyRemoteTokens).toBe(true);
  });

  it.each([
    ['a bare origin with no trailing slash', 'http://localhost:8888'],
    ['an uppercase host', 'https://Example.com/lab'],
    ['an explicit default port', 'https://example.com:443/lab']
  ])('does not report %s as a removed token', async (_name, stored) => {
    mockSafeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          recentSessions: [
            {
              // a v4.6.3-1 row for a server whose URL never had a token
              remoteURL: stored,
              persistSessionData: true,
              partition: 'persist:one',
              date: '2024-01-01T00:00:00.000Z'
            }
          ],
          sessions: [{ remoteURL: stored, persistSessionData: true }]
        })
      )
    );
    appData.read();
    expect(appData.recentSessions[0].legacyRemoteURL).toBeUndefined();
    expect(appData.sessions[0].legacyRemoteURL).toBeUndefined();
    await appData.migrateRemoteCredentials();
    expect(appData.removedLegacyRemoteTokens).toBe(false);
    expect(appData.recentSessions[0].encryptedRemoteURL).toBeUndefined();
  });

  it('still reports a row whose URL carried userinfo', async () => {
    mockSafeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          recentSessions: [
            {
              remoteURL: 'https://user:pw@lab.example.com/lab',
              persistSessionData: true,
              partition: 'persist:one',
              date: '2024-01-01T00:00:00.000Z'
            }
          ]
        })
      )
    );
    appData.read();
    await appData.migrateRemoteCredentials();
    expect(appData.removedLegacyRemoteTokens).toBe(true);
  });

  it('stays quiet for a session that declined to persist its data', async () => {
    mockSafeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);
    readOneLegacyRow(false);
    await appData.migrateRemoteCredentials();
    expect(appData.removedLegacyRemoteTokens).toBe(false);
  });
});

describe('ApplicationData.mergeDuplicateRecents', () => {
  beforeEach(() => {
    resetAppData();
    mockSession.fromPartition.mockClear();
  });

  // An install upgraded from a release that kept the token in the URL holds one
  // recents row per token. Reading maps them all onto the same canonical URL,
  // so the lists end up with rows the user cannot tell apart.
  function readThreeVisitsToOneServer() {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          recentSessions: [
            {
              remoteURL: 'https://lab.example.com/lab?token=old',
              persistSessionData: true,
              partition: 'persist:old',
              date: '2024-01-01T00:00:00.000Z'
            },
            {
              remoteURL: 'https://lab.example.com/lab?token=newest',
              persistSessionData: true,
              partition: 'persist:newest',
              date: '2024-03-01T00:00:00.000Z'
            },
            {
              remoteURL: 'https://lab.example.com/lab?token=middle',
              persistSessionData: true,
              partition: 'persist:middle',
              date: '2024-02-01T00:00:00.000Z'
            },
            {
              workingDirectory: '/data/nb',
              date: '2024-02-15T00:00:00.000Z'
            }
          ],
          recentRemoteURLs: [
            {
              url: 'https://lab.example.com/lab?token=old',
              date: '2024-01-01T00:00:00.000Z'
            },
            {
              url: 'https://lab.example.com/lab?token=newest',
              date: '2024-03-01T00:00:00.000Z'
            },
            {
              url: 'https://other.example.com/lab',
              date: '2024-02-01T00:00:00.000Z'
            }
          ]
        })
      )
    );
    appData.read();
  }

  it('collapses recent remote URLs that differ only by a stripped query', async () => {
    readThreeVisitsToOneServer();
    expect(appData.recentRemoteURLs).toHaveLength(3);
    await expect(appData.mergeDuplicateRecents()).resolves.toBe(true);
    expect(appData.recentRemoteURLs.map(item => item.url)).toEqual([
      'https://lab.example.com/lab',
      'https://other.example.com/lab'
    ]);
  });

  it('keeps the newest row for a server and every local session', async () => {
    readThreeVisitsToOneServer();
    await appData.mergeDuplicateRecents();
    expect(appData.recentSessions).toHaveLength(2);
    const remote = appData.recentSessions.find(item => item.remoteURL);
    expect(remote.remoteURL).toBe('https://lab.example.com/lab');
    expect(remote.partition).toBe('persist:newest');
    expect(
      appData.recentSessions.some(item => item.workingDirectory === '/data/nb')
    ).toBe(true);
  });

  it('releases the session data of the rows it drops', async () => {
    readThreeVisitsToOneServer();
    await appData.mergeDuplicateRecents();
    const cleared = mockSession.fromPartition.mock.calls
      .map(call => call[0])
      .sort();
    expect(cleared).toEqual(['persist:middle', 'persist:old']);
  });

  it('keeps the credential of the newest row for a server', async () => {
    appData.recentSessions = [
      {
        remoteURL: 'https://lab.example.com/lab',
        filesToOpen: [],
        persistSessionData: true,
        partition: 'persist:newest',
        encryptedRemoteURL: 'blob-newest',
        date: new Date('2024-03-01')
      },
      {
        remoteURL: 'https://lab.example.com/lab',
        filesToOpen: [],
        persistSessionData: true,
        partition: 'persist:old',
        encryptedRemoteURL: 'blob-old',
        date: new Date('2024-01-01')
      }
    ];
    await expect(appData.mergeDuplicateRecents()).resolves.toBe(true);
    expect(appData.recentSessions).toHaveLength(1);
    expect(appData.recentSessions[0].encryptedRemoteURL).toBe('blob-newest');
  });

  it('collapses rows for one server written with different URL spellings', async () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          recentRemoteURLs: [
            {
              url: 'https://lab.example.com:443/lab',
              date: '2024-01-01T00:00:00.000Z'
            },
            {
              url: 'https://lab.example.com/lab?token=x',
              date: '2024-02-01T00:00:00.000Z'
            }
          ]
        })
      )
    );
    appData.read();
    await expect(appData.mergeDuplicateRecents()).resolves.toBe(true);
    expect(appData.recentRemoteURLs.map(item => item.url)).toEqual([
      'https://lab.example.com/lab'
    ]);
  });

  it('keeps the session data a window is about to restore into', async () => {
    readThreeVisitsToOneServer();
    // two windows were open on this server, so a restored session still holds
    // the partition of a row the merge drops
    const restored = new SessionConfig();
    restored.partition = 'persist:old';
    appData.sessions = [restored];
    await appData.mergeDuplicateRecents();
    expect(mockSession.fromPartition.mock.calls.map(call => call[0])).toEqual([
      'persist:middle'
    ]);
  });

  it('changes nothing when every server appears once', async () => {
    appData.recentSessions = [
      {
        remoteURL: 'https://a.example.com/lab',
        filesToOpen: [],
        partition: 'persist:a',
        date: new Date('2024-01-01')
      },
      {
        workingDirectory: '/data/nb',
        filesToOpen: [],
        date: new Date('2024-01-02')
      }
    ];
    appData.recentRemoteURLs = [
      { url: 'https://a.example.com/lab', date: new Date('2024-01-01') }
    ];
    await expect(appData.mergeDuplicateRecents()).resolves.toBe(false);
    expect(appData.recentSessions).toHaveLength(2);
    expect(appData.recentRemoteURLs).toHaveLength(1);
    expect(mockSession.fromPartition).not.toHaveBeenCalled();
  });
});

describe('ApplicationData.addRemoteURLToRecents', () => {
  beforeEach(() => {
    appData.recentRemoteURLs = [];
  });

  it('adds a new URL', () => {
    appData.addRemoteURLToRecents('https://example.com/lab');
    expect(appData.recentRemoteURLs).toHaveLength(1);
    expect(appData.recentRemoteURLs[0].url).toBe('https://example.com/lab');
  });

  it('new entry gets a date close to now', () => {
    const before = Date.now();
    appData.addRemoteURLToRecents('https://example.com/lab');
    expect(appData.recentRemoteURLs[0].date.valueOf()).toBeGreaterThanOrEqual(
      before
    );
  });

  it('updates date of existing URL without duplicating', () => {
    const oldDate = new Date(Date.now() - 5000);
    appData.recentRemoteURLs = [
      { url: 'https://example.com/lab', date: oldDate }
    ];
    appData.addRemoteURLToRecents('https://example.com/lab');
    expect(appData.recentRemoteURLs).toHaveLength(1);
    expect(appData.recentRemoteURLs[0].date.valueOf()).toBeGreaterThan(
      oldDate.valueOf()
    );
  });

  it('treats different URLs as separate entries', () => {
    appData.addRemoteURLToRecents('https://a.example.com/lab');
    appData.addRemoteURLToRecents('https://b.example.com/lab');
    expect(appData.recentRemoteURLs).toHaveLength(2);
  });
});

describe('ApplicationData.removeRemoteURLFromRecents', () => {
  beforeEach(() => {
    appData.recentRemoteURLs = [
      { url: 'https://a.example.com/lab', date: new Date() },
      { url: 'https://b.example.com/lab', date: new Date() }
    ];
  });

  it('removes the matching URL', () => {
    appData.removeRemoteURLFromRecents('https://a.example.com/lab');
    expect(appData.recentRemoteURLs).toHaveLength(1);
    expect(appData.recentRemoteURLs[0].url).toBe('https://b.example.com/lab');
  });

  it('no-ops when URL is not in list', () => {
    appData.removeRemoteURLFromRecents('https://missing.example.com/lab');
    expect(appData.recentRemoteURLs).toHaveLength(2);
  });
});

describe('ApplicationData.addSessionToRecents', () => {
  beforeEach(() => {
    appData.recentSessions = [];
  });

  it('adds a new local session', async () => {
    await appData.addSessionToRecents({
      workingDirectory: '/data/nb',
      filesToOpen: []
    });
    expect(appData.recentSessions).toHaveLength(1);
    expect(appData.recentSessions[0].workingDirectory).toBe('/data/nb');
  });

  it('adds a new remote session', async () => {
    await appData.addSessionToRecents({
      remoteURL: 'https://hub.example.com/lab',
      filesToOpen: []
    });
    expect(appData.recentSessions).toHaveLength(1);
    expect(appData.recentSessions[0].remoteURL).toBe(
      'https://hub.example.com/lab'
    );
  });

  it('caps the recents list at 20 entries', async () => {
    for (let i = 0; i < 25; i++) {
      await appData.addSessionToRecents({
        workingDirectory: `/data/nb${i}`,
        filesToOpen: []
      });
    }
    expect(appData.recentSessions).toHaveLength(20);
  });

  it('updates date of duplicate local session without duplicating', async () => {
    const oldDate = new Date(Date.now() - 5000);
    appData.recentSessions = [
      {
        workingDirectory: '/data/nb',
        filesToOpen: [],
        date: oldDate
      }
    ];
    await appData.addSessionToRecents({
      workingDirectory: '/data/nb',
      filesToOpen: []
    });
    expect(appData.recentSessions).toHaveLength(1);
    expect(appData.recentSessions[0].date.valueOf()).toBeGreaterThan(
      oldDate.valueOf()
    );
  });

  it('re-adding existing session updates date without duplicating', async () => {
    await appData.addSessionToRecents({
      workingDirectory: '/a',
      filesToOpen: []
    });
    const before = appData.recentSessions[0].date.valueOf();
    // small delay so new Date() advances
    await new Promise(r => setTimeout(r, 5));
    await appData.addSessionToRecents({
      workingDirectory: '/a',
      filesToOpen: []
    });
    expect(appData.recentSessions).toHaveLength(1);
    expect(appData.recentSessions[0].date.valueOf()).toBeGreaterThanOrEqual(
      before
    );
  });
});

describe('ApplicationData.removeSessionFromRecents', () => {
  beforeEach(() => {
    appData.recentSessions = [
      { workingDirectory: '/a', filesToOpen: [], date: new Date() },
      { workingDirectory: '/b', filesToOpen: [], date: new Date() }
    ];
  });

  it('removes session at given index', async () => {
    await appData.removeSessionFromRecents(0);
    expect(appData.recentSessions).toHaveLength(1);
    expect(appData.recentSessions[0].workingDirectory).toBe('/b');
  });

  it('no-ops for out-of-bounds index', async () => {
    await appData.removeSessionFromRecents(99);
    expect(appData.recentSessions).toHaveLength(2);
  });

  it('no-ops for negative index', async () => {
    await appData.removeSessionFromRecents(-1);
    expect(appData.recentSessions).toHaveLength(2);
  });
});
