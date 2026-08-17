import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    lstatSync: vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
    readFileSync: vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    realpathSync: vi.fn((target: any) => target),
    chownSync: vi.fn(),
    fchmodSync: vi.fn(),
    openSync: vi.fn(() => 7),
    fsyncSync: vi.fn(),
    closeSync: vi.fn(),
    unlinkSync: vi.fn()
  };
});

import { appData, ApplicationData } from '../../src/main/config/appdata';
import {
  getUnreadableConfigFiles,
  resetConfigFile
} from '../../src/main/utils';

const mockFs = vi.mocked(fs);

// Without this, an existsSync or readFileSync left set by one test feeds the
// next one whatever the previous body returned.
beforeEach(() => {
  vi.clearAllMocks();
  mockFs.existsSync = vi.fn(() => false);
  mockFs.lstatSync = vi.fn(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }) as any;
  mockFs.readFileSync = vi.fn(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }) as any;
  mockFs.writeFileSync = vi.fn();
  mockFs.mkdirSync = vi.fn();
  mockFs.renameSync = vi.fn();
  mockFs.realpathSync = vi.fn((target: any) => target) as any;
  mockFs.statSync = vi.fn(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }) as any;
  mockFs.chownSync = vi.fn();
  mockFs.fchmodSync = vi.fn();
  mockFs.openSync = vi.fn(() => 7) as any;
  mockFs.fsyncSync = vi.fn();
  mockFs.closeSync = vi.fn();
  mockFs.unlinkSync = vi.fn();
});

// the unreadable-config list is keyed by path and app-data.json has only one,
// so a corrupt-read test would otherwise block every save that follows
afterEach(() => {
  // the mark now outlives any read, so clearing it takes the same route the
  // Reset to Defaults button does
  mockFs.existsSync = vi.fn(() => false);
  mockFs.renameSync = vi.fn();
  resetConfigFile(ApplicationData.getAppDataPath());
  resetAppData();
});

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

  it('keeps its state when the file does not exist', () => {
    mockFs.readFileSync = vi.fn(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }) as any;
    const pythonPathBefore = appData.pythonPath;

    appData.read();

    expect(appData.pythonPath).toBe(pythonPathBefore);
    expect(getUnreadableConfigFiles()).not.toContain(
      ApplicationData.getAppDataPath()
    );
  });

  it('keeps its state instead of throwing when the file is corrupt', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() => Buffer.from('{"pythonPath": '));
    appData.pythonPath = '/usr/bin/python3';

    appData.read();

    expect(appData.pythonPath).toBe('/usr/bin/python3');
  });

  it('survives junk inside the arrays instead of throwing at import', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          sessions: [null],
          recentSessions: ['not an object'],
          userSetPythonEnvs: [42],
          newsList: [null, { title: 'kept', link: 'https://example.org' }]
        })
      )
    ) as any;

    expect(() => appData.read()).not.toThrow();
    expect(appData.sessions).toHaveLength(0);
    expect(appData.recentSessions).toHaveLength(0);
    expect(appData.userSetPythonEnvs).toHaveLength(0);
    expect(appData.newsList).toEqual([
      { title: 'kept', link: 'https://example.org' }
    ]);
  });

  it('survives a session whose filesToOpen is not a list', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ sessions: [{ filesToOpen: 3 }] }))
    ) as any;

    expect(() => appData.read()).not.toThrow();
    expect(appData.sessions[0].filesToOpen).toEqual([]);
  });

  it('survives entries whose date is missing or unparseable', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          recentSessions: [{ workingDirectory: '/nb' }],
          recentRemoteURLs: [{ url: 'http://x', date: 'whenever' }],
          sessions: [{ lastOpened: 'whenever' }]
        })
      )
    ) as any;

    appData.read();

    // save() calls toISOString on each of these; an Invalid Date throws there,
    // and save() runs from will-quit after preventDefault
    expect(() => appData.save()).not.toThrow();
  });

  it('drops a partition that is not a string', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          recentSessions: [
            { workingDirectory: '/nb', partition: 42, date: '2024-01-01' }
          ]
        })
      )
    ) as any;

    appData.read();

    // startsWith is called on this when a recent session is removed
    expect(appData.recentSessions[0].partition).toBeUndefined();
  });

  it('does not turn a mangled persistSessionData into persistence', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ sessions: [{ persistSessionData: null }] }))
    ) as any;

    appData.read();

    // this decides whether a remote server's cookies land on disk
    expect(appData.sessions[0].persistSessionData).toBe(false);
  });

  it('drops an environment whose type is not a string', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          userSetPythonEnvs: [{ name: 'x', path: '/usr/bin/python3', type: 42 }]
        })
      )
    ) as any;

    appData.read();

    // a number takes the else branch of every enum compare, silently
    expect(appData.userSetPythonEnvs).toEqual([]);
  });

  it('empties versions of the wrong shape on an otherwise usable env', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          userSetPythonEnvs: [
            {
              name: 'x',
              path: '/usr/bin/python3',
              type: 'path',
              versions: '3.11'
            }
          ]
        })
      )
    ) as any;

    appData.read();

    // spreading a string gives { '0': '3', '1': '.' }
    expect(appData.userSetPythonEnvs[0].versions).toEqual({});
  });

  it('drops an environment whose path is not a string', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          userSetPythonEnvs: [{ name: 'x', path: 42, type: 'path' }]
        })
      )
    ) as any;

    appData.read();

    // kept with an undefined path it would still be offered as an environment
    expect(appData.userSetPythonEnvs).toEqual([]);
  });

  it('ignores a non-boolean updateBundledEnvOnRestart', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ updateBundledEnvOnRestart: 'false' }))
    ) as any;
    appData.updateBundledEnvOnRestart = false;

    appData.read();

    // the string is truthy, and a stray true reinstalls the bundled env
    expect(appData.updateBundledEnvOnRestart).toBe(false);
  });

  it('ignores a scalar that is not a string', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ pythonPath: {}, condaPath: [1, 2] }))
    ) as any;
    appData.pythonPath = '';
    appData.condaPath = '';

    expect(() => appData.read()).not.toThrow();
    expect(appData.pythonPath).toBe('');
    expect(appData.condaPath).toBe('');
  });

  it('drops a nested array, which is an object as far as typeof knows', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(JSON.stringify({ recentSessions: [[]], newsList: [[]] }))
    ) as any;

    expect(() => appData.read()).not.toThrow();
    expect(appData.recentSessions).toHaveLength(0);
    expect(appData.newsList).toHaveLength(0);
  });

  it('drops a recent session naming neither a directory nor a URL', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          recentSessions: [
            { date: '2024-01-01' },
            { workingDirectory: '/nb' },
            { remoteURL: 'https://example.com' }
          ]
        })
      )
    ) as any;

    appData.read();

    // the first names nothing to reopen, and the welcome view draws a row per
    // entry whatever is in it
    expect(appData.recentSessions).toHaveLength(2);
  });

  it('drops a recent remote URL without a url', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          recentRemoteURLs: [{ date: '2024-01-01' }, { url: 'https://ok.test' }]
        })
      )
    ) as any;

    appData.read();

    expect(appData.recentRemoteURLs.map(entry => entry.url)).toEqual([
      'https://ok.test'
    ]);
  });

  it('drops a news item missing its title or its link', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          newsList: [
            { link: 'https://example.com' },
            { title: 'no link' },
            { title: 'kept', link: 'https://example.org' }
          ]
        })
      )
    ) as any;

    appData.read();

    expect(appData.newsList).toEqual([
      { title: 'kept', link: 'https://example.org' }
    ]);
  });

  it('drops a filesToOpen that is not a list', () => {
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          recentSessions: [{ workingDirectory: '/nb', filesToOpen: 3 }]
        })
      )
    ) as any;

    expect(() => appData.read()).not.toThrow();
    expect(appData.recentSessions[0].filesToOpen).toEqual([]);
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
    expect(appData.condaPath).toContain('/opt/conda');
  });

  it('reads recentRemoteURLs list', () => {
    const date = new Date('2024-01-01').toISOString();
    mockFs.existsSync = vi.fn(() => true);
    mockFs.readFileSync = vi.fn(() =>
      Buffer.from(
        JSON.stringify({
          recentRemoteURLs: [{ url: 'https://example.com', date }]
        })
      )
    );
    appData.read();
    expect(appData.recentRemoteURLs).toHaveLength(1);
    expect(appData.recentRemoteURLs[0].url).toBe('https://example.com');
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

  it('lands on the app-data.json path', () => {
    appData.save();
    expect(mockFs.renameSync).toHaveBeenCalledOnce();
    const [, target] = (mockFs.renameSync as any).mock.calls[0];
    expect(target).toMatch(/app-data\.json$/);
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

  it('saves recentRemoteURLs with ISO date strings', () => {
    appData.recentRemoteURLs = [
      { url: 'https://example.com', date: new Date('2024-06-01') }
    ];
    appData.save();
    const content = (mockFs.writeFileSync as any).mock.calls[0][1] as string;
    const json = JSON.parse(content);
    expect(json.recentRemoteURLs).toHaveLength(1);
    expect(json.recentRemoteURLs[0].url).toBe('https://example.com');
    expect(typeof json.recentRemoteURLs[0].date).toBe('string');
  });
});

describe('ApplicationData.addRemoteURLToRecents', () => {
  beforeEach(() => {
    appData.recentRemoteURLs = [];
  });

  it('adds a new URL', () => {
    appData.addRemoteURLToRecents('https://example.com');
    expect(appData.recentRemoteURLs).toHaveLength(1);
    expect(appData.recentRemoteURLs[0].url).toBe('https://example.com');
  });

  it('new entry gets a date close to now', () => {
    const before = Date.now();
    appData.addRemoteURLToRecents('https://example.com');
    expect(appData.recentRemoteURLs[0].date.valueOf()).toBeGreaterThanOrEqual(
      before
    );
  });

  it('updates date of existing URL without duplicating', () => {
    const oldDate = new Date(Date.now() - 5000);
    appData.recentRemoteURLs = [{ url: 'https://example.com', date: oldDate }];
    appData.addRemoteURLToRecents('https://example.com');
    expect(appData.recentRemoteURLs).toHaveLength(1);
    expect(appData.recentRemoteURLs[0].date.valueOf()).toBeGreaterThan(
      oldDate.valueOf()
    );
  });

  it('treats different URLs as separate entries', () => {
    appData.addRemoteURLToRecents('https://a.com');
    appData.addRemoteURLToRecents('https://b.com');
    expect(appData.recentRemoteURLs).toHaveLength(2);
  });
});

describe('ApplicationData.removeRemoteURLFromRecents', () => {
  beforeEach(() => {
    appData.recentRemoteURLs = [
      { url: 'https://a.com', date: new Date() },
      { url: 'https://b.com', date: new Date() }
    ];
  });

  it('removes the matching URL', () => {
    appData.removeRemoteURLFromRecents('https://a.com');
    expect(appData.recentRemoteURLs).toHaveLength(1);
    expect(appData.recentRemoteURLs[0].url).toBe('https://b.com');
  });

  it('no-ops when URL is not in list', () => {
    appData.removeRemoteURLFromRecents('https://missing.com');
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
      remoteURL: 'https://hub.example.com',
      filesToOpen: []
    });
    expect(appData.recentSessions).toHaveLength(1);
    expect(appData.recentSessions[0].remoteURL).toBe('https://hub.example.com');
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
