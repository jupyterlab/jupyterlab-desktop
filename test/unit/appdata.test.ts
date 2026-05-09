import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => {
      throw new Error('ENOENT');
    }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  };
});

import {
  appData,
  ApplicationData,
  IRecentRemoteURL,
  IRecentSession
} from '../../../src/main/config/appdata';

const mockFs = vi.mocked(fs);

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

  it('no-ops gracefully when file does not exist', () => {
    mockFs.existsSync = vi.fn(() => false);
    expect(() => appData.read()).not.toThrow();
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

  it('calls writeFileSync with app-data.json path', () => {
    appData.save();
    expect(mockFs.writeFileSync).toHaveBeenCalledOnce();
    const [writePath] = (mockFs.writeFileSync as any).mock.calls[0];
    expect(writePath).toMatch(/app-data\.json$/);
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
