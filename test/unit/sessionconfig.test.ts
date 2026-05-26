import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return { ...actual, existsSync: vi.fn(), lstatSync: vi.fn() };
});
vi.mock('../../src/main/config/settings', () => ({
  userSettings: {
    getValue: vi.fn(() => ''),
    resolvedWorkingDirectory: '/home/user'
  },
  SettingType: {
    defaultWorkingDirectory: 'defaultWorkingDirectory',
    pythonPath: 'pythonPath'
  },
  DEFAULT_WIN_WIDTH: 1024,
  DEFAULT_WIN_HEIGHT: 768,
  resolveWorkingDirectory: vi.fn((dir: string) => dir || '/home/user')
}));
vi.mock('../../src/main/config/appdata', () => ({
  appData: { recentSessions: [] }
}));

import { SessionConfig } from '../../src/main/config/sessionconfig';

const mockFs = vi.mocked(fs);

describe('SessionConfig defaults', () => {
  it('x and y default to 0', () => {
    const s = new SessionConfig();
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
  });

  it('width and height default to 1024x768', () => {
    const s = new SessionConfig();
    expect(s.width).toBe(1024);
    expect(s.height).toBe(768);
  });

  it('persistSessionData defaults to true', () => {
    expect(new SessionConfig().persistSessionData).toBe(true);
  });

  it('filesToOpen defaults to empty array', () => {
    expect(new SessionConfig().filesToOpen).toEqual([]);
  });

  it('remoteURL defaults to empty string', () => {
    expect(new SessionConfig().remoteURL).toBe('');
  });
});

describe('SessionConfig.isRemote', () => {
  it('false when remoteURL is empty', () => {
    expect(new SessionConfig().isRemote).toBe(false);
  });

  it('true when remoteURL is set', () => {
    const s = new SessionConfig();
    s.remoteURL = 'http://localhost:8888/lab';
    expect(s.isRemote).toBe(true);
  });
});

describe('SessionConfig.createLocal', () => {
  it('returns a SessionConfig', () => {
    expect(SessionConfig.createLocal()).toBeInstanceOf(SessionConfig);
  });

  it('sets workingDirectory from argument', () => {
    const s = SessionConfig.createLocal('/data/notebooks');
    expect(s.workingDirectory).toBe('/data/notebooks');
  });

  it('sets filesToOpen when files exist', () => {
    mockFs.lstatSync = vi.fn(() => ({ isFile: () => true } as fs.Stats));
    const s = SessionConfig.createLocal('/data', ['a.ipynb', 'b.ipynb']);
    expect(s.filesToOpen).toEqual(['a.ipynb', 'b.ipynb']);
  });

  it('skips files that do not exist', () => {
    mockFs.lstatSync = vi.fn(() => {
      throw new Error('ENOENT');
    });
    const s = SessionConfig.createLocal('/data', ['missing.ipynb']);
    expect(s.filesToOpen).toEqual([]);
  });

  it('skips paths that are not files', () => {
    mockFs.lstatSync = vi.fn(() => ({ isFile: () => false } as fs.Stats));
    const s = SessionConfig.createLocal('/data', ['subdir']);
    expect(s.filesToOpen).toEqual([]);
  });

  it('sets pythonPath when provided', () => {
    const s = SessionConfig.createLocal('/data', undefined, '/usr/bin/python3');
    expect(s.pythonPath).toBe('/usr/bin/python3');
  });
});

describe('SessionConfig.createRemote', () => {
  it('sets remoteURL', () => {
    const s = SessionConfig.createRemote(
      'http://localhost:8888/lab?token=abc',
      true,
      ''
    );
    expect(s.remoteURL).toBe('http://localhost:8888/lab?token=abc');
    expect(s.isRemote).toBe(true);
  });

  it('extracts token from URL', () => {
    const s = SessionConfig.createRemote(
      'http://localhost:8888/lab?token=mysecret',
      true,
      ''
    );
    expect(s.token).toBe('mysecret');
  });

  it('persist partition when persistSessionData is true', () => {
    const s = SessionConfig.createRemote(
      'http://localhost:8888/lab?token=x',
      true,
      ''
    );
    expect(s.partition).toMatch(/^persist:/);
  });

  it('non-persist partition when persistSessionData is false', () => {
    const s = SessionConfig.createRemote(
      'http://localhost:8888/lab?token=x',
      false,
      ''
    );
    expect(s.partition).toMatch(/^partition:/);
  });

  it('uses provided partition instead of generating one', () => {
    const s = SessionConfig.createRemote(
      'http://localhost:8888/lab?token=x',
      true,
      'persist:my-custom-id'
    );
    expect(s.partition).toBe('persist:my-custom-id');
  });

  it('sets persistSessionData to false correctly', () => {
    const s = SessionConfig.createRemote(
      'http://localhost:8888/lab?token=x',
      false,
      ''
    );
    expect(s.persistSessionData).toBe(false);
  });

  it('persistSessionData defaults to true when not false', () => {
    const s = SessionConfig.createRemote(
      'http://localhost:8888/lab?token=x',
      true,
      ''
    );
    expect(s.persistSessionData).toBe(true);
  });
});

describe('SessionConfig.createLocalForFilesOrFolders', () => {
  it('creates session in parent dir of first file', () => {
    mockFs.lstatSync = vi.fn(
      () => ({ isFile: () => true, isDirectory: () => false } as fs.Stats)
    );
    const s = SessionConfig.createLocalForFilesOrFolders([
      '/data/nb/test.ipynb'
    ]);
    expect(s.workingDirectory).toBe('/data/nb');
  });

  it('creates session at directory path', () => {
    mockFs.lstatSync = vi.fn(
      () => ({ isFile: () => false, isDirectory: () => true } as fs.Stats)
    );
    const s = SessionConfig.createLocalForFilesOrFolders(['/data/notebooks']);
    expect(s.workingDirectory).toBe('/data/notebooks');
  });

  it('returns undefined for empty array', () => {
    const s = SessionConfig.createLocalForFilesOrFolders([]);
    expect(s).toBeUndefined();
  });

  it('skips paths where lstatSync throws', () => {
    mockFs.lstatSync = vi.fn(() => {
      throw new Error('ENOENT');
    });
    const s = SessionConfig.createLocalForFilesOrFolders([
      '/missing/path.ipynb'
    ]);
    expect(s).toBeUndefined();
  });

  it('prefers files over folders when both given', () => {
    let call = 0;
    mockFs.lstatSync = vi.fn(() => {
      call++;
      if (call === 1)
        return { isFile: () => false, isDirectory: () => true } as fs.Stats; // folder first
      return { isFile: () => true, isDirectory: () => false } as fs.Stats; // then file
    });
    const s = SessionConfig.createLocalForFilesOrFolders([
      '/some/folder',
      '/some/folder/note.ipynb'
    ]);
    // files take precedence: working dir should be parent of the file
    expect(s.workingDirectory).toBe('/some/folder');
  });
});

describe('SessionConfig.createFromArgs', () => {
  beforeEach(() => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.lstatSync = vi.fn(() => {
      throw new Error('ENOENT');
    });
  });

  it('returns undefined when no args', () => {
    const result = SessionConfig.createFromArgs({
      _: [],
      $0: '',
      cwd: '/cwd',
      pythonPath: '',
      workingDir: ''
    });
    expect(result).toBeUndefined();
  });

  it('creates remote session for https URL', () => {
    const result = SessionConfig.createFromArgs({
      _: ['https://example.com/lab?token=tok'],
      $0: '',
      cwd: '/cwd',
      pythonPath: '',
      workingDir: ''
    });
    expect(result).toBeDefined();
    expect(result.isRemote).toBe(true);
    expect(result.remoteURL).toBe('https://example.com/lab?token=tok');
  });

  it('uses a persist: partition when persistSessionData is true', () => {
    const result = SessionConfig.createFromArgs({
      _: ['https://example.com/lab?token=tok'],
      $0: '',
      cwd: '/cwd',
      pythonPath: '',
      workingDir: '',
      persistSessionData: true
    });
    expect(result.persistSessionData).toBe(true);
    expect(result.partition.startsWith('persist:')).toBe(true);
  });

  it('uses a non-persistent partition when persistSessionData is not set', () => {
    const result = SessionConfig.createFromArgs({
      _: ['https://example.com/lab?token=tok'],
      $0: '',
      cwd: '/cwd',
      pythonPath: '',
      workingDir: ''
    });
    expect(result.persistSessionData).toBe(false);
    expect(result.partition.startsWith('partition:')).toBe(true);
  });

  it('creates remote session for http URL', () => {
    const result = SessionConfig.createFromArgs({
      _: ['http://localhost:8888/lab?token=abc'],
      $0: '',
      cwd: '/cwd',
      pythonPath: '',
      workingDir: ''
    });
    expect(result.isRemote).toBe(true);
  });

  it('creates local session when workingDir exists', () => {
    mockFs.existsSync = vi.fn(() => true);
    const result = SessionConfig.createFromArgs({
      _: [],
      $0: '',
      cwd: '/cwd',
      pythonPath: '',
      workingDir: '/valid/dir'
    });
    expect(result).toBeDefined();
    expect(result.isRemote).toBe(false);
    expect(result.workingDirectory).toContain('valid');
  });

  it('returns undefined when workingDir does not exist and no files', () => {
    mockFs.existsSync = vi.fn(() => false);
    const result = SessionConfig.createFromArgs({
      _: [],
      $0: '',
      cwd: '/cwd',
      pythonPath: '',
      workingDir: '/nonexistent'
    });
    expect(result).toBeUndefined();
  });

  it('includes file paths resolved from cwd', () => {
    mockFs.existsSync = vi.fn(() => false);
    mockFs.lstatSync = vi.fn(
      () => ({ isFile: () => true, isDirectory: () => false } as fs.Stats)
    );
    const result = SessionConfig.createFromArgs({
      _: ['test.ipynb'],
      $0: '',
      cwd: '/cwd',
      pythonPath: '',
      workingDir: ''
    });
    expect(result.filesToOpen.some(f => f.includes('test.ipynb'))).toBe(true);
  });

  it('includes pythonPath when it exists', () => {
    mockFs.existsSync = vi.fn((p: fs.PathLike) => {
      const pathStr = p.toString();
      return pathStr.includes('python3') || pathStr.includes('valid/dir');
    });
    const result = SessionConfig.createFromArgs({
      _: [],
      $0: '',
      cwd: '/cwd',
      pythonPath: '/usr/bin/python3',
      workingDir: '/valid/dir'
    });
    expect(result).toBeDefined();
    expect(result.pythonPath).toContain('python3');
  });

  it('excludes pythonPath when it does not exist', () => {
    mockFs.existsSync = vi.fn((p: fs.PathLike) => {
      return p.toString().includes('valid/dir');
    });
    const result = SessionConfig.createFromArgs({
      _: [],
      $0: '',
      cwd: '/cwd',
      pythonPath: '/nonexistent/python',
      workingDir: '/valid/dir'
    });
    expect(result).toBeDefined();
    expect(result.pythonPath).toBe('');
  });
});

describe('SessionConfig.serialize', () => {
  it('always includes x, y, width, height, lastOpened', () => {
    const s = new SessionConfig();
    const json = s.serialize();
    expect(json).toHaveProperty('x');
    expect(json).toHaveProperty('y');
    expect(json).toHaveProperty('width');
    expect(json).toHaveProperty('height');
    expect(json).toHaveProperty('lastOpened');
  });

  it('omits remoteURL when empty', () => {
    const json = new SessionConfig().serialize();
    expect(json).not.toHaveProperty('remoteURL');
  });

  it('includes remoteURL when set', () => {
    const s = new SessionConfig();
    s.remoteURL = 'http://localhost:8888/lab';
    expect(s.serialize()).toHaveProperty(
      'remoteURL',
      'http://localhost:8888/lab'
    );
  });

  it('omits persistSessionData when true (default)', () => {
    expect(new SessionConfig().serialize()).not.toHaveProperty(
      'persistSessionData'
    );
  });

  it('includes persistSessionData when false', () => {
    const s = new SessionConfig();
    s.persistSessionData = false;
    expect(s.serialize()).toHaveProperty('persistSessionData', false);
  });

  it('omits partition when persistSessionData is false', () => {
    const s = new SessionConfig();
    s.persistSessionData = false;
    s.partition = 'partition:123';
    expect(s.serialize()).not.toHaveProperty('partition');
  });

  it('includes partition when persistSessionData is true', () => {
    const s = new SessionConfig();
    s.partition = 'persist:abc';
    expect(s.serialize()).toHaveProperty('partition', 'persist:abc');
  });

  it('omits workingDirectory when empty', () => {
    expect(new SessionConfig().serialize()).not.toHaveProperty(
      'workingDirectory'
    );
  });

  it('includes workingDirectory when set', () => {
    const s = new SessionConfig();
    s.workingDirectory = '/data/notebooks';
    expect(s.serialize()).toHaveProperty('workingDirectory', '/data/notebooks');
  });

  it('omits filesToOpen when empty', () => {
    expect(new SessionConfig().serialize()).not.toHaveProperty('filesToOpen');
  });

  it('includes filesToOpen when non-empty', () => {
    const s = new SessionConfig();
    s.filesToOpen = ['test.ipynb'];
    expect(s.serialize()).toHaveProperty('filesToOpen', ['test.ipynb']);
  });

  it('lastOpened is ISO string', () => {
    const s = new SessionConfig();
    const json = s.serialize();
    expect(Number.isNaN(new Date(json.lastOpened).getTime())).toBe(false);
    expect(new Date(json.lastOpened).getFullYear()).toBeGreaterThanOrEqual(
      2020
    );
  });
});

describe('SessionConfig.deserialize', () => {
  it('sets x, y, width, height', () => {
    const s = new SessionConfig();
    s.deserialize({ x: 10, y: 20, width: 800, height: 600 });
    expect(s.x).toBe(10);
    expect(s.y).toBe(20);
    expect(s.width).toBe(800);
    expect(s.height).toBe(600);
  });

  it('sets remoteURL', () => {
    const s = new SessionConfig();
    s.deserialize({ remoteURL: 'http://remote:8888/lab' });
    expect(s.remoteURL).toBe('http://remote:8888/lab');
  });

  it('sets persistSessionData', () => {
    const s = new SessionConfig();
    s.deserialize({ persistSessionData: false });
    expect(s.persistSessionData).toBe(false);
  });

  it('sets partition only when persistSessionData is true', () => {
    const s = new SessionConfig();
    s.deserialize({ persistSessionData: true, partition: 'persist:xyz' });
    expect(s.partition).toBe('persist:xyz');
  });

  it('ignores partition when persistSessionData is false', () => {
    const s = new SessionConfig();
    s.deserialize({ persistSessionData: false, partition: 'persist:xyz' });
    expect(s.partition).toBe('');
  });

  it('sets workingDirectory', () => {
    const s = new SessionConfig();
    s.deserialize({ workingDirectory: '/data/nb' });
    expect(s.workingDirectory).toBe('/data/nb');
  });

  it('sets filesToOpen', () => {
    const s = new SessionConfig();
    s.deserialize({ filesToOpen: ['a.ipynb', 'b.ipynb'] });
    expect(s.filesToOpen).toEqual(['a.ipynb', 'b.ipynb']);
  });

  it('parses lastOpened as Date', () => {
    const s = new SessionConfig();
    const iso = '2024-01-15T10:30:00.000Z';
    s.deserialize({ lastOpened: iso });
    expect(s.lastOpened).toBeInstanceOf(Date);
    expect(s.lastOpened.getFullYear()).toBe(2024);
  });

  it('ignores unknown keys', () => {
    const s = new SessionConfig();
    expect(() => s.deserialize({ unknownKey: 'value' })).not.toThrow();
  });
});

describe('SessionConfig serialize/deserialize round-trip', () => {
  it('round-trips a local session', () => {
    const original = new SessionConfig();
    original.workingDirectory = '/data/notebooks';
    original.filesToOpen = ['test.ipynb'];
    original.x = 50;
    original.y = 100;
    original.width = 1200;
    original.height = 900;

    const copy = new SessionConfig();
    copy.deserialize(original.serialize());

    expect(copy.workingDirectory).toBe('/data/notebooks');
    expect(copy.filesToOpen).toEqual(['test.ipynb']);
    expect(copy.x).toBe(50);
    expect(copy.width).toBe(1200);
  });

  it('round-trips a remote session', () => {
    const original = SessionConfig.createRemote(
      'http://remote:8888/lab?token=tok',
      true,
      'persist:id123'
    );
    const copy = new SessionConfig();
    copy.deserialize(original.serialize());

    expect(copy.remoteURL).toBe('http://remote:8888/lab?token=tok');
    expect(copy.persistSessionData).toBe(true);
    expect(copy.partition).toBe('persist:id123');
    expect(copy.isRemote).toBe(true);
  });

  it('round-trips a non-persistent remote session', () => {
    const original = SessionConfig.createRemote(
      'http://remote:8888/lab?token=tok',
      false,
      ''
    );
    const copy = new SessionConfig();
    copy.deserialize(original.serialize());

    expect(copy.persistSessionData).toBe(false);
    expect(copy.partition).toBe('');
  });
});
